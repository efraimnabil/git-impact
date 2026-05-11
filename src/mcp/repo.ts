/**
 * Repo path resolution — priority order:
 *
 *  1. Explicit arg passed by the model ("~/code/my-app")
 *  2. **Sticky cache** — the path we resolved last time on this process.
 *     The skill calls 3-5 MCP tools per standup; resolving once and
 *     reusing avoids the bug where get_git_activity finds a repo via
 *     cwd but save_impact_entry — called moments later — gets a
 *     different cwd and fails.
 *  3. Walk up from process.cwd() until a .git folder is found
 *  4. Fail with a clear message asking the user to set a default
 */

import * as path from "path";
import * as fs from "fs";
import * as process from "process";
import * as os from "os";

let stickyRepo: string | null = null;

/** Reset the cached path. Used by tests; not part of the public API. */
export function _resetStickyRepoForTests(): void {
  stickyRepo = null;
}

export function resolveRepoPath(explicitPath?: string): { path: string; source: string } {
  // 1. Explicit arg — highest priority
  if (explicitPath) {
    const resolved = expandHome(explicitPath);
    assertIsGitRepo(resolved);
    stickyRepo = resolved;
    return { path: resolved, source: "explicit" };
  }

  // 2. Sticky cache — within a single MCP server process, reuse the path
  // we successfully resolved earlier. Critical because cwd may shift
  // between tool calls and we don't want save_impact_entry to fail just
  // because get_git_activity already worked.
  if (stickyRepo && isGitRepo(stickyRepo)) {
    return { path: stickyRepo, source: "sticky" };
  }

  // 3. Walk up from cwd — works when Claude Code opens a project folder
  const fromCwd = findGitRoot(process.cwd());
  if (fromCwd) {
    stickyRepo = fromCwd;
    return { path: fromCwd, source: "cwd" };
  }

  // 4. Nothing found.
  //
  // Most common cause: the skill called an MCP tool without passing `repo_path`.
  // The MCP server lives outside the user's project (often the npx cache), so
  // cwd-based detection rarely works. The fix is always at the skill layer:
  // pass repo_path explicitly, sourced from the editor's working directory.
  throw new Error(
    "No git repository found.\n\n" +
    "MCP server cwd: " + process.cwd() + " (not a git repo).\n\n" +
    "Pass `repo_path` explicitly — the absolute path of the user's open " +
    "project. Most Claude Code skills can find this via $PWD or a Bash " +
    "`pwd` call before invoking MCP tools. Once you've called one tool with " +
    "an explicit path, the server caches it for the rest of the session."
  );
}

/** Walk up directory tree until a .git folder is found, or return null */
function findGitRoot(dir: string): string | null {
  let current = path.resolve(dir);
  const root = path.parse(current).root;

  while (current !== root) {
    if (isGitRepo(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) break; // filesystem root
    current = parent;
  }
  return null;
}

function isGitRepo(dir: string): boolean {
  try {
    return fs.statSync(path.join(dir, ".git")).isDirectory();
  } catch {
    return false;
  }
}

function assertIsGitRepo(dir: string): void {
  if (!fs.existsSync(dir)) {
    throw new Error(`Path does not exist: ${dir}`);
  }
  if (!isGitRepo(dir)) {
    throw new Error(`Not a git repository: ${dir}`);
  }
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  if (p === "~") return os.homedir();
  return p;
}
