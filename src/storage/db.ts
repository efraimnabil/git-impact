import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";

// ─── Per-repo layout ──────────────────────────────────────────────────────────
//
//   <repo-root>/
//   ├── .git-impact/
//   │   ├── context.json   ← company desc, glossary, priorities  (commit this)
//   │   └── history.db     ← SQLite standup history               (gitignored)
//
// Two separate files because context is team-shareable; history is per-machine.

const GIT_IMPACT_DIR = ".git-impact";
const CONTEXT_FILE = "context.json";
const HISTORY_FILE = "history.db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserContext {
  companyDescription: string;
  managerPriorities: string;
  glossary: Record<string, string>;
  githubToken?: string;
  /**
   * Optional privacy filter config. Default: enabled. Filenames matching env /
   * credentials patterns are redacted; obvious-looking secrets in commit
   * bodies are too. Override via `{ "privacy": { "redact": false } }` to disable
   * or `{ "privacy": { "filePatterns": [...], "valuePatterns": [...] } }` to extend.
   */
  privacy?: {
    redact?: boolean;
    filePatterns?: string[];
    valuePatterns?: string[];
  };
}

export type ImpactStatus = "done" | "in_progress" | "blocked";
export type ImpactProvenance = "pr" | "commit_body" | "commit_message" | "ticket" | "inferred";

export interface ImpactItem {
  status: ImpactStatus;
  summary: string;
  impact: string;
  technical_note?: string;
  /** Where the "why it matters" came from. "inferred" means the model guessed — surface this in UI. */
  provenance?: ImpactProvenance;
  /** Optional supporting refs (PR numbers, commit hashes, ticket IDs) for the bullet. */
  refs?: string[];
}

export interface ImpactEntry {
  id?: number;
  date: string;
  repoPath: string;
  repoName: string;
  totalCommits: number;
  totalFiles: number;
  filesSummary: string;
  items: ImpactItem[];
  rawJson: string;
  createdAt: string;
}

// ─── DB (per-repo, cached by repo root) ──────────────────────────────────────

const _dbs = new Map<string, Database.Database>();

function getDb(repoRoot: string): Database.Database {
  if (_dbs.has(repoRoot)) return _dbs.get(repoRoot)!;

  const dir = gitImpactDir(repoRoot);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(path.join(dir, HISTORY_FILE));

  db.exec(`
    CREATE TABLE IF NOT EXISTS impact_entries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT    NOT NULL,
      repo_path   TEXT    NOT NULL DEFAULT '',
      repo_name   TEXT    NOT NULL,
      total_commits INTEGER NOT NULL DEFAULT 0,
      total_files   INTEGER NOT NULL DEFAULT 0,
      files_summary TEXT    NOT NULL DEFAULT '',
      items_json    TEXT    NOT NULL DEFAULT '[]',
      raw_json      TEXT    NOT NULL DEFAULT '{}',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_entries_date ON impact_entries (date);
    CREATE INDEX IF NOT EXISTS idx_entries_repo ON impact_entries (repo_name);
  `);

  // Schema migration: pre-Phase-1 dbs (created by the bash-skill era) are
  // missing repo_path, files_summary, and raw_json. CREATE TABLE IF NOT EXISTS
  // doesn't add those, so we have to ALTER TABLE explicitly. Idempotent —
  // each ADD COLUMN runs only if the column isn't there yet.
  migrateImpactEntriesSchema(db);

  _dbs.set(repoRoot, db);
  return db;
}

/**
 * Bring an older `impact_entries` table up to the current schema by adding
 * any columns that are missing. Defaults are chosen so old rows remain valid.
 *
 * Why this matters: a repo that ran git-impact before Phase 1 has a
 * history.db with the original schema (date / repo_name / total_commits /
 * total_files / items_json / created_at). New code writes the post-Phase-1
 * shape and would fail with "table impact_entries has no column named
 * repo_path" without this.
 */
function migrateImpactEntriesSchema(db: Database.Database): void {
  const cols = db
    .prepare(`PRAGMA table_info(impact_entries)`)
    .all() as Array<{ name: string }>;
  const have = new Set(cols.map((c) => c.name));

  const migrations: Array<[string, string]> = [
    ["repo_path",     `ALTER TABLE impact_entries ADD COLUMN repo_path TEXT NOT NULL DEFAULT ''`],
    ["files_summary", `ALTER TABLE impact_entries ADD COLUMN files_summary TEXT NOT NULL DEFAULT ''`],
    ["raw_json",      `ALTER TABLE impact_entries ADD COLUMN raw_json TEXT NOT NULL DEFAULT '{}'`],
  ];

  for (const [col, sql] of migrations) {
    if (!have.has(col)) db.exec(sql);
  }
}

// ─── Context (JSON file, committable) ────────────────────────────────────────

export function loadContext(repoRoot: string): UserContext | null {
  const filePath = path.join(gitImpactDir(repoRoot), CONTEXT_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as UserContext;
  } catch {
    return null;
  }
}

export function saveContext(ctx: UserContext, repoRoot: string): void {
  const dir = gitImpactDir(repoRoot);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, CONTEXT_FILE),
    JSON.stringify(ctx, null, 2) + "\n",
    "utf-8"
  );
}

// ─── Entries ──────────────────────────────────────────────────────────────────

export function saveEntry(entry: ImpactEntry, repoRoot: string): number {
  const db = getDb(repoRoot);
  const result = db.prepare(`
    INSERT INTO impact_entries
      (date, repo_path, repo_name, total_commits, total_files, files_summary, items_json, raw_json, created_at)
    VALUES
      (@date, @repoPath, @repoName, @totalCommits, @totalFiles, @filesSummary, @itemsJson, @rawJson, @createdAt)
  `).run({
    date: entry.date,
    repoPath: entry.repoPath,
    repoName: entry.repoName,
    totalCommits: entry.totalCommits,
    totalFiles: entry.totalFiles,
    filesSummary: entry.filesSummary,
    itemsJson: JSON.stringify(entry.items),
    rawJson: entry.rawJson,
    createdAt: entry.createdAt || new Date().toISOString(),
  });
  return result.lastInsertRowid as number;
}

export function getEntriesForRange(
  fromDate: string,
  toDate: string,
  repoRoot: string
): ImpactEntry[] {
  const db = getDb(repoRoot);
  const rows = db
    .prepare(`SELECT * FROM impact_entries WHERE date >= ? AND date <= ? ORDER BY date ASC`)
    .all(fromDate, toDate) as Record<string, unknown>[];
  return rows.map(rowToEntry);
}

/**
 * Returns the most recent saved entry's date (YYYY-MM-DD), or null if none exists.
 * Used to power "since last standup" — the default mode after Phase 1.
 */
export function getLastEntryDate(repoRoot: string): string | null {
  const db = getDb(repoRoot);
  const row = db
    .prepare(`SELECT date FROM impact_entries ORDER BY date DESC, id DESC LIMIT 1`)
    .get() as { date?: string } | undefined;
  return row?.date ?? null;
}

export function getEntriesForDaysAgo(days: number, repoRoot: string): ImpactEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const from = cutoff.toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  return getEntriesForRange(from, to, repoRoot);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gitImpactDir(repoRoot: string): string {
  return path.join(repoRoot, GIT_IMPACT_DIR);
}

function rowToEntry(row: Record<string, unknown>): ImpactEntry {
  return {
    id: row.id as number,
    date: row.date as string,
    repoPath: row.repo_path as string,
    repoName: row.repo_name as string,
    totalCommits: row.total_commits as number,
    totalFiles: row.total_files as number,
    filesSummary: row.files_summary as string,
    items: JSON.parse((row.items_json as string) || "[]"),
    rawJson: row.raw_json as string,
    createdAt: row.created_at as string,
  };
}
