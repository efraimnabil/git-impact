/**
 * Repo path resolution — priority order:
 *
 *  1. Explicit arg passed by Claude (user said "~/code/my-app")
 *  2. Default repo saved in user context (set once, reused forever)
 *  3. Walk up from process.cwd() until a .git folder is found
 *     → works in Claude Code CLI where cwd = open project
 *  4. Fail with a clear message asking the user to set a default
 */

import * as path from "path";
import * as fs from "fs";
import * as process from "process";
import * as os from "os";

export function resolveRepoPath(explicitPath?: string): { path: string; source: string } {
  // 1. Explicit arg — highest priority
  if (explicitPath) {
    const resolved = expandHome(explicitPath);
    assertIsGitRepo(resolved);
    return { path: resolved, source: "explicit" };
  }

  // 2. Walk up from cwd — works when Claude Code Desktop opens a project folder
  const fromCwd = findGitRoot(process.cwd());
  if (fromCwd) {
    return { path: fromCwd, source: "cwd" };
  }

  // 3. Nothing found
  throw new Error(
    "No git repository found.\n\n" +
    "Set a default repo once with:\n" +
    '  "set my default repo to /Users/you/code/my-project"\n\n' +
    "Or tell me the path directly:\n" +
    '  "do my standup for ~/code/my-project"'
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
