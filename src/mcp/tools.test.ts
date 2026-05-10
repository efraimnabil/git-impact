import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { handleTool } from "./tools";
import { _resetStickyRepoForTests } from "./repo";

let tmp: string;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tools-")));
  execSync(`git -C ${tmp} init -q`);
  execSync(`git -C ${tmp} config user.email t@t`);
  execSync(`git -C ${tmp} config user.name T`);
  fs.writeFileSync(path.join(tmp, "README.md"), "x");
  execSync(`git -C ${tmp} add . && git -C ${tmp} commit -q -m init`);
  _resetStickyRepoForTests();
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("save → render_dashboard flow", () => {
  it("save_impact_entry then render_dashboard produces a result.html", async () => {
    // Save a row.
    const save = await handleTool("save_impact_entry", {
      repo_path: tmp,
      date: "2026-05-09",
      repo_name: "test",
      total_commits: 1,
      total_files: 1,
      items: [
        {
          status: "done",
          summary: "Shipped X",
          impact: "Unblocked Y",
          provenance: "pr",
          refs: ["PR #1"],
        },
      ],
    });
    expect(save.isError).toBeFalsy();

    // Render the dashboard.
    const render = await handleTool("render_dashboard", { repo_path: tmp });
    expect(render.isError).toBeFalsy();
    const result = JSON.parse(render.content[0].text);
    expect(result.entry_count).toBe(1);
    expect(result.url.startsWith("file://")).toBe(true);
    expect(fs.existsSync(result.html_path)).toBe(true);

    // The HTML should embed the saved item.
    const html = fs.readFileSync(result.html_path, "utf-8");
    expect(html).toContain("Shipped X");
  });

  it("render_dashboard works on a repo with no history (empty file)", async () => {
    const render = await handleTool("render_dashboard", { repo_path: tmp });
    expect(render.isError).toBeFalsy();
    const result = JSON.parse(render.content[0].text);
    expect(result.entry_count).toBe(0);
    expect(fs.existsSync(result.html_path)).toBe(true);
  });
});

describe("sticky repo: tools chain without re-passing repo_path", () => {
  it("save_impact_entry succeeds even after cwd moved away from the repo", async () => {
    // First call resolves the repo via explicit path (and primes sticky).
    const get = await handleTool("get_git_activity", { repo_path: tmp });
    expect(get.isError).toBeFalsy();

    // Move cwd somewhere with no git repo to simulate the original bug.
    const originalCwd = process.cwd();
    const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), "nowhere-"));
    try {
      process.chdir(nowhere);

      // Save WITHOUT repo_path — used to throw before the sticky cache.
      const save = await handleTool("save_impact_entry", {
        date: "2026-05-09",
        repo_name: "test",
        total_commits: 1,
        total_files: 1,
        items: [
          { status: "done", summary: "X", provenance: "inferred" },
        ],
      });
      expect(save.isError).toBeFalsy();
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(nowhere, { recursive: true, force: true });
    }
  });
});
