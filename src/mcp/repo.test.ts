import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { resolveRepoPath, _resetStickyRepoForTests } from "./repo";

let tmpA: string;
let tmpB: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpA = fs.mkdtempSync(path.join(os.tmpdir(), "repo-A-"));
  tmpB = fs.mkdtempSync(path.join(os.tmpdir(), "repo-B-"));
  // Real fs.realpathSync to handle macOS /var → /private/var symlink.
  tmpA = fs.realpathSync(tmpA);
  tmpB = fs.realpathSync(tmpB);
  execSync(`git -C ${tmpA} init -q`);
  execSync(`git -C ${tmpB} init -q`);
  _resetStickyRepoForTests();
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpA, { recursive: true, force: true });
  fs.rmSync(tmpB, { recursive: true, force: true });
});

describe("resolveRepoPath", () => {
  it("uses an explicit path when provided", () => {
    const r = resolveRepoPath(tmpA);
    expect(r.path).toBe(tmpA);
    expect(r.source).toBe("explicit");
  });

  it("walks up from cwd", () => {
    process.chdir(tmpA);
    const r = resolveRepoPath();
    expect(r.path).toBe(tmpA);
    expect(r.source).toBe("cwd");
  });

  it("caches the resolved path across calls (sticky)", () => {
    // First call — resolved via cwd.
    process.chdir(tmpA);
    const first = resolveRepoPath();
    expect(first.source).toBe("cwd");

    // Move cwd OUT of any git repo. Without sticky, this would throw.
    const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), "nowhere-"));
    try {
      process.chdir(nowhere);
      const second = resolveRepoPath();
      expect(second.path).toBe(tmpA);
      expect(second.source).toBe("sticky");
    } finally {
      fs.rmSync(nowhere, { recursive: true, force: true });
    }
  });

  it("explicit path beats sticky cache", () => {
    // Prime the cache with tmpA.
    resolveRepoPath(tmpA);
    // Explicit override → should pick tmpB.
    const r = resolveRepoPath(tmpB);
    expect(r.path).toBe(tmpB);
    expect(r.source).toBe("explicit");
  });

  it("subsequent calls without args use sticky after explicit", () => {
    // Set sticky via explicit.
    resolveRepoPath(tmpA);
    // Move cwd somewhere with no git.
    const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), "nowhere-"));
    try {
      process.chdir(nowhere);
      const r = resolveRepoPath();
      expect(r.path).toBe(tmpA);
      expect(r.source).toBe("sticky");
    } finally {
      fs.rmSync(nowhere, { recursive: true, force: true });
    }
  });

  it("throws a helpful error when nothing resolves", () => {
    const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), "nowhere-"));
    try {
      process.chdir(nowhere);
      expect(() => resolveRepoPath()).toThrow(/No git repository found/);
    } finally {
      fs.rmSync(nowhere, { recursive: true, force: true });
    }
  });

  it("rejects an explicit path that isn't a git repo", () => {
    const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), "notrepo-"));
    try {
      expect(() => resolveRepoPath(notARepo)).toThrow(/Not a git repository/);
    } finally {
      fs.rmSync(notARepo, { recursive: true, force: true });
    }
  });
});
