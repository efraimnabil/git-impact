"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadContext = loadContext;
exports.saveContext = saveContext;
exports.saveEntry = saveEntry;
exports.getEntriesForRange = getEntriesForRange;
exports.getLastEntryDate = getLastEntryDate;
exports.getEntriesForDaysAgo = getEntriesForDaysAgo;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
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
const GITIGNORE_ENTRY = ".git-impact/history.db";
// ─── DB (per-repo, cached by repo root) ──────────────────────────────────────
const _dbs = new Map();
function getDb(repoRoot) {
    if (_dbs.has(repoRoot))
        return _dbs.get(repoRoot);
    const dir = gitImpactDir(repoRoot);
    fs.mkdirSync(dir, { recursive: true });
    ensureGitignore(repoRoot);
    const db = new better_sqlite3_1.default(path.join(dir, HISTORY_FILE));
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
function migrateImpactEntriesSchema(db) {
    const cols = db
        .prepare(`PRAGMA table_info(impact_entries)`)
        .all();
    const have = new Set(cols.map((c) => c.name));
    const migrations = [
        ["repo_path", `ALTER TABLE impact_entries ADD COLUMN repo_path TEXT NOT NULL DEFAULT ''`],
        ["files_summary", `ALTER TABLE impact_entries ADD COLUMN files_summary TEXT NOT NULL DEFAULT ''`],
        ["raw_json", `ALTER TABLE impact_entries ADD COLUMN raw_json TEXT NOT NULL DEFAULT '{}'`],
    ];
    for (const [col, sql] of migrations) {
        if (!have.has(col))
            db.exec(sql);
    }
}
// ─── Context (JSON file, committable) ────────────────────────────────────────
function loadContext(repoRoot) {
    const filePath = path.join(gitImpactDir(repoRoot), CONTEXT_FILE);
    if (!fs.existsSync(filePath))
        return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
    catch {
        return null;
    }
}
function saveContext(ctx, repoRoot) {
    const dir = gitImpactDir(repoRoot);
    fs.mkdirSync(dir, { recursive: true });
    ensureGitignore(repoRoot);
    fs.writeFileSync(path.join(dir, CONTEXT_FILE), JSON.stringify(ctx, null, 2) + "\n", "utf-8");
}
// ─── Entries ──────────────────────────────────────────────────────────────────
function saveEntry(entry, repoRoot) {
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
    return result.lastInsertRowid;
}
function getEntriesForRange(fromDate, toDate, repoRoot) {
    const db = getDb(repoRoot);
    const rows = db
        .prepare(`SELECT * FROM impact_entries WHERE date >= ? AND date <= ? ORDER BY date ASC`)
        .all(fromDate, toDate);
    return rows.map(rowToEntry);
}
/**
 * Returns the most recent saved entry's date (YYYY-MM-DD), or null if none exists.
 * Used to power "since last standup" — the default mode after Phase 1.
 */
function getLastEntryDate(repoRoot) {
    const db = getDb(repoRoot);
    const row = db
        .prepare(`SELECT date FROM impact_entries ORDER BY date DESC, id DESC LIMIT 1`)
        .get();
    return row?.date ?? null;
}
function getEntriesForDaysAgo(days, repoRoot) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const from = cutoff.toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    return getEntriesForRange(from, to, repoRoot);
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function gitImpactDir(repoRoot) {
    return path.join(repoRoot, GIT_IMPACT_DIR);
}
/** Add history.db to .gitignore automatically — only the DB, not context.json */
function ensureGitignore(repoRoot) {
    const gitignorePath = path.join(repoRoot, ".gitignore");
    const existing = fs.existsSync(gitignorePath)
        ? fs.readFileSync(gitignorePath, "utf-8")
        : "";
    if (!existing.includes(GITIGNORE_ENTRY)) {
        const addition = `\n# git-impact local history (private, per-machine)\n${GITIGNORE_ENTRY}\n`;
        fs.appendFileSync(gitignorePath, addition, "utf-8");
    }
}
function rowToEntry(row) {
    return {
        id: row.id,
        date: row.date,
        repoPath: row.repo_path,
        repoName: row.repo_name,
        totalCommits: row.total_commits,
        totalFiles: row.total_files,
        filesSummary: row.files_summary,
        items: JSON.parse(row.items_json || "[]"),
        rawJson: row.raw_json,
        createdAt: row.created_at,
    };
}
//# sourceMappingURL=db.js.map