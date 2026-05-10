"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports._resetStickyRepoForTests = _resetStickyRepoForTests;
exports.resolveRepoPath = resolveRepoPath;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const process = __importStar(require("process"));
const os = __importStar(require("os"));
let stickyRepo = null;
/** Reset the cached path. Used by tests; not part of the public API. */
function _resetStickyRepoForTests() {
    stickyRepo = null;
}
function resolveRepoPath(explicitPath) {
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
    // 4. Nothing found
    throw new Error("No git repository found.\n\n" +
        "The MCP server's cwd is not inside a git repo, and no path was given.\n" +
        "Tell me the absolute path:\n" +
        '  "do my standup for ~/code/my-project"\n\n' +
        "Once resolved, the path is cached for the rest of this MCP session.");
}
/** Walk up directory tree until a .git folder is found, or return null */
function findGitRoot(dir) {
    let current = path.resolve(dir);
    const root = path.parse(current).root;
    while (current !== root) {
        if (isGitRepo(current))
            return current;
        const parent = path.dirname(current);
        if (parent === current)
            break; // filesystem root
        current = parent;
    }
    return null;
}
function isGitRepo(dir) {
    try {
        return fs.statSync(path.join(dir, ".git")).isDirectory();
    }
    catch {
        return false;
    }
}
function assertIsGitRepo(dir) {
    if (!fs.existsSync(dir)) {
        throw new Error(`Path does not exist: ${dir}`);
    }
    if (!isGitRepo(dir)) {
        throw new Error(`Not a git repository: ${dir}`);
    }
}
function expandHome(p) {
    if (p.startsWith("~/"))
        return path.join(os.homedir(), p.slice(2));
    if (p === "~")
        return os.homedir();
    return p;
}
//# sourceMappingURL=repo.js.map