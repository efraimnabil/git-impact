import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import Database from "better-sqlite3";
import {
  saveEntry,
  saveContext,
  loadContext,
  getEntriesForRange,
  getEntriesForDaysAgo,
  getLastEntryDate,
  ImpactItem,
} from "./db";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "git-impact-test-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("context.json round-trip", () => {
  it("saves and loads context", () => {
    saveContext(
      {
        companyDescription: "Test Co",
        managerPriorities: "Ship fast",
        glossary: { RLS: "data security" },
      },
      tmp
    );
    const loaded = loadContext(tmp);
    expect(loaded?.companyDescription).toBe("Test Co");
    expect(loaded?.glossary.RLS).toBe("data security");
  });

  it("returns null when no context file exists", () => {
    expect(loadContext(tmp)).toBeNull();
  });

  it("preserves privacy config", () => {
    saveContext(
      {
        companyDescription: "X",
        managerPriorities: "Y",
        glossary: {},
        privacy: { redact: false, filePatterns: ["*.internal"] },
      },
      tmp
    );
    const loaded = loadContext(tmp);
    expect(loaded?.privacy?.redact).toBe(false);
    expect(loaded?.privacy?.filePatterns).toEqual(["*.internal"]);
  });
});

describe("impact entries", () => {
  const item = (over: Partial<ImpactItem> = {}): ImpactItem => ({
    status: "done",
    summary: "Shipped X",
    impact: "Unblocked Y",
    provenance: "pr",
    ...over,
  });

  it("getLastEntryDate returns null when empty", () => {
    expect(getLastEntryDate(tmp)).toBeNull();
  });

  it("saves an entry and getLastEntryDate finds it", () => {
    saveEntry(
      {
        date: "2026-05-09",
        repoPath: tmp,
        repoName: "test",
        totalCommits: 1,
        totalFiles: 1,
        filesSummary: "src",
        items: [item()],
        rawJson: "[]",
        createdAt: new Date().toISOString(),
      },
      tmp
    );
    expect(getLastEntryDate(tmp)).toBe("2026-05-09");
  });

  it("getLastEntryDate returns the most recent across many entries", () => {
    const dates = ["2026-05-01", "2026-05-09", "2026-05-05"];
    for (const date of dates) {
      saveEntry(
        {
          date,
          repoPath: tmp,
          repoName: "r",
          totalCommits: 1,
          totalFiles: 1,
          filesSummary: "",
          items: [item()],
          rawJson: "[]",
          createdAt: new Date().toISOString(),
        },
        tmp
      );
    }
    expect(getLastEntryDate(tmp)).toBe("2026-05-09");
  });

  it("preserves provenance and refs through save → get", () => {
    saveEntry(
      {
        date: "2026-05-09",
        repoPath: tmp,
        repoName: "r",
        totalCommits: 1,
        totalFiles: 1,
        filesSummary: "",
        items: [
          item({ provenance: "inferred", refs: ["PR #42", "ENG-1234"] }),
        ],
        rawJson: "[]",
        createdAt: new Date().toISOString(),
      },
      tmp
    );
    const entries = getEntriesForRange("2026-05-09", "2026-05-09", tmp);
    expect(entries[0].items[0].provenance).toBe("inferred");
    expect(entries[0].items[0].refs).toEqual(["PR #42", "ENG-1234"]);
  });

  it("migrates a pre-Phase-1 schema in place (regression for v0.6.3 user report)", () => {
    // Simulate the old schema a real user's repo had: no repo_path, no
    // files_summary, no raw_json. This is what the old bash-skill SQL block
    // created. If we don't migrate, the next saveEntry insert will fail with
    // "table impact_entries has no column named repo_path".
    const dir = path.join(tmp, ".git-impact");
    fs.mkdirSync(dir, { recursive: true });
    const dbPath = path.join(dir, "history.db");
    const raw = new Database(dbPath);
    raw.exec(`
      CREATE TABLE impact_entries (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        date          TEXT NOT NULL,
        repo_name     TEXT NOT NULL,
        total_commits INTEGER NOT NULL DEFAULT 0,
        total_files   INTEGER NOT NULL DEFAULT 0,
        items_json    TEXT NOT NULL DEFAULT '[]',
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO impact_entries (date, repo_name, total_commits, total_files, items_json)
      VALUES ('2026-05-01', 'old-repo', 3, 5, '[{"summary":"old entry"}]');
    `);
    raw.close();

    // Now use the public API — this should auto-migrate on first open.
    saveEntry(
      {
        date: "2026-05-09",
        repoPath: tmp,
        repoName: "post-migration",
        totalCommits: 1,
        totalFiles: 1,
        filesSummary: "src",
        items: [item({ provenance: "pr", refs: ["PR #99"] })],
        rawJson: "[]",
        createdAt: new Date().toISOString(),
      },
      tmp
    );

    // Both rows should be readable. Old row preserved with default values
    // for the new columns; new row carries the new fields.
    const entries = getEntriesForRange("2026-05-01", "2026-05-31", tmp);
    expect(entries).toHaveLength(2);
    const old = entries.find((e) => e.repoName === "old-repo");
    const fresh = entries.find((e) => e.repoName === "post-migration");
    expect(old?.totalCommits).toBe(3);
    expect(old?.filesSummary).toBe(""); // default for migrated rows
    expect(fresh?.items[0].provenance).toBe("pr");
  });

  it("getEntriesForDaysAgo returns recent entries", () => {
    const today = new Date().toISOString().slice(0, 10);
    saveEntry(
      {
        date: today,
        repoPath: tmp,
        repoName: "r",
        totalCommits: 1,
        totalFiles: 1,
        filesSummary: "",
        items: [item()],
        rawJson: "[]",
        createdAt: new Date().toISOString(),
      },
      tmp
    );
    const entries = getEntriesForDaysAgo(7, tmp);
    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBe(today);
  });
});
