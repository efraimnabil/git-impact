import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
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
