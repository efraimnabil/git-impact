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
exports.readGitActivity = readGitActivity;
exports.startOfDay = startOfDay;
exports.startOfDaysAgo = startOfDaysAgo;
const simple_git_1 = __importDefault(require("simple-git"));
const path = __importStar(require("path"));
const redact_1 = require("./redact");
const DEFAULTS = {
    maxCommits: 200,
    includeDiff: false,
    maxFilesPerCommit: 50,
};
function stripCredentials(url) {
    try {
        const parsed = new URL(url);
        parsed.username = "";
        parsed.password = "";
        return parsed.toString();
    }
    catch {
        return url.replace(/\/\/[^@]+@/, "//");
    }
}
async function readGitActivity(repoPath, since, until = new Date(), redactCfg = { enabled: true }, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const git = (0, simple_git_1.default)(repoPath);
    const sinceStr = since.toISOString();
    const untilStr = until.toISOString();
    const log = await git.log([
        `--since=${sinceStr}`,
        `--until=${untilStr}`,
        "--author-date-order",
    ]);
    const remotes = await git.getRemotes(true);
    const originRemote = remotes.find((r) => r.name === "origin");
    const remoteUrl = originRemote?.refs?.fetch
        ? stripCredentials(originRemote.refs.fetch)
        : "";
    const repoName = remoteUrl
        .replace(/\.git$/, "")
        .split("/")
        .slice(-2)
        .join("/") || path.basename(repoPath);
    const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
    // Cap commit count. Older commits drop off — newest-first is what users care about.
    const commitsTotal = log.all.length;
    const entries = log.all.slice(0, opts.maxCommits);
    const commitsTruncated = commitsTotal > entries.length;
    const commits = await Promise.all(entries.map(async (entry) => {
        // Files changed — always fetched (it's the primary structural signal).
        // But cap per-commit so a 6,898-file commit doesn't dominate the response.
        const showOutput = await git.show([
            "--stat",
            "--name-only",
            "--format=",
            entry.hash,
        ]);
        const allFiles = showOutput
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l && !l.includes("|") && !l.startsWith("=>") && !l.match(/^\d+ file/))
            .map((f) => (0, redact_1.redactFilename)(f, redactCfg));
        const filesChangedTruncated = allFiles.length > opts.maxFilesPerCommit;
        const filesChanged = filesChangedTruncated
            ? allFiles.slice(0, opts.maxFilesPerCommit)
            : allFiles;
        // Diff is opt-in — large diffs were the main culprit blowing past the
        // MCP token budget on big weeks. Most translations don't need them;
        // commit body + file list usually carries the signal.
        let diff;
        if (opts.includeDiff) {
            const raw = await git
                .diff([`${entry.hash}^`, entry.hash, "--stat"])
                .catch(() => git.show(["--stat", "--format=", entry.hash]));
            diff = (0, redact_1.redactText)(raw, redactCfg);
        }
        const commitInfo = {
            hash: entry.hash.slice(0, 8),
            date: entry.date,
            message: (0, redact_1.redactText)(entry.message, redactCfg),
            author: entry.author_name,
            body: (0, redact_1.redactText)(entry.body || "", redactCfg),
            filesChanged,
        };
        if (diff)
            commitInfo.diff = diff;
        if (filesChangedTruncated) {
            commitInfo.filesChangedTruncated = true;
            commitInfo.filesChangedCount = allFiles.length;
        }
        return commitInfo;
    }));
    const totalFilesChanged = new Set(commits.flatMap((c) => c.filesChanged)).size;
    const summary = {
        commits,
        totalFilesChanged,
        repoName,
        branch: branch.trim(),
        dateRange: { from: sinceStr, to: untilStr },
    };
    if (commitsTruncated) {
        summary.commitsTruncated = true;
        summary.commitsTotal = commitsTotal;
    }
    return summary;
}
function startOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}
function startOfDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d;
}
//# sourceMappingURL=git.js.map