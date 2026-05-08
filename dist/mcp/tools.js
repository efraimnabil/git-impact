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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_DEFINITIONS = void 0;
exports.handleTool = handleTool;
const git_1 = require("../readers/git");
const github_1 = require("../readers/github");
const db_1 = require("../storage/db");
const repo_1 = require("./repo");
// ─── Tool definitions ────────────────────────────────────────────────────────
exports.TOOL_DEFINITIONS = [
    {
        name: "get_git_activity",
        description: "Read raw git commits and file changes from the current repository. " +
            "Automatically detects the open project — no path needed. " +
            "Returns structured commit data: messages, bodies, changed file paths, and diff stats. " +
            "Always call this first before generating a standup or impact summary.",
        inputSchema: {
            type: "object",
            properties: {
                repo_path: {
                    type: "string",
                    description: "Override the repo path. Omit to auto-detect from the open project.",
                },
                since_iso: {
                    type: "string",
                    description: "ISO 8601 start time. Defaults to start of today.",
                },
                until_iso: {
                    type: "string",
                    description: "ISO 8601 end time. Defaults to now.",
                },
            },
        },
    },
    {
        name: "get_github_activity",
        description: "Fetch GitHub PR activity (opened, merged, reviewed) for the current repo. " +
            "Requires a GitHub token saved in .git-impact/context.json via update_context.",
        inputSchema: {
            type: "object",
            properties: {
                repo_path: { type: "string", description: "Override the repo path." },
                since_iso: { type: "string", description: "ISO 8601 start time. Defaults to start of today." },
                until_iso: { type: "string", description: "ISO 8601 end time. Defaults to now." },
            },
        },
    },
    {
        name: "save_impact_entry",
        description: "Persist a completed impact translation to this repo's local history (.git-impact/history.db). " +
            "Call after translating commits into business impact bullets.",
        inputSchema: {
            type: "object",
            required: ["date", "repo_name", "items"],
            properties: {
                repo_path: { type: "string", description: "Override the repo path." },
                date: { type: "string", description: "ISO date YYYY-MM-DD." },
                repo_name: { type: "string", description: "Human-readable name e.g. 'org/repo'." },
                total_commits: { type: "number" },
                total_files: { type: "number" },
                files_summary: { type: "string" },
                items: {
                    type: "array",
                    description: "The translated impact bullets.",
                    items: {
                        type: "object",
                        required: ["status", "summary", "impact"],
                        properties: {
                            status: { type: "string", enum: ["done", "in_progress"] },
                            summary: { type: "string" },
                            impact: { type: "string" },
                            technical_note: { type: "string" },
                        },
                    },
                },
            },
        },
    },
    {
        name: "get_history",
        description: "Retrieve saved impact entries from this repo's history. " +
            "Use when generating a performance review or when the user asks about past work.",
        inputSchema: {
            type: "object",
            properties: {
                repo_path: { type: "string", description: "Override the repo path." },
                last_days: { type: "number", description: "Last N days. Defaults to 30." },
                from_date: { type: "string", description: "ISO date YYYY-MM-DD." },
                to_date: { type: "string", description: "ISO date YYYY-MM-DD." },
            },
        },
    },
    {
        name: "update_context",
        description: "Save personalization to this repo's .git-impact/context.json: " +
            "company description, manager priorities, technical glossary, GitHub token. " +
            "context.json can be committed to share settings with teammates. " +
            "Call when the user wants to configure the tool for this project.",
        inputSchema: {
            type: "object",
            properties: {
                repo_path: { type: "string", description: "Override the repo path." },
                company_description: { type: "string" },
                manager_priorities: { type: "string" },
                glossary: {
                    type: "object",
                    description: "Technical term → plain English. e.g. { 'RLS': 'data security layer' }",
                    additionalProperties: { type: "string" },
                },
                github_token: { type: "string" },
                anthropic_api_key: { type: "string" },
            },
        },
    },
];
async function handleTool(name, args) {
    switch (name) {
        case "get_git_activity": return handleGetGitActivity(args);
        case "get_github_activity": return handleGetGitHubActivity(args);
        case "save_impact_entry": return handleSaveImpactEntry(args);
        case "get_history": return handleGetHistory(args);
        case "update_context": return handleUpdateContext(args);
        default: return error(`Unknown tool: ${name}`);
    }
}
// ─── Handlers ────────────────────────────────────────────────────────────────
async function handleGetGitActivity(args) {
    const repo = resolveRepo(args.repo_path);
    if ("error" in repo)
        return error(repo.error);
    const since = args.since_iso ? new Date(args.since_iso) : (0, git_1.startOfDay)();
    const until = args.until_iso ? new Date(args.until_iso) : new Date();
    try {
        const git = await (0, git_1.readGitActivity)(repo.path, since, until);
        return ok(JSON.stringify({ ...git, _repo_root: repo.path }, null, 2));
    }
    catch (err) {
        return error(`Could not read git history: ${err.message}`);
    }
}
async function handleGetGitHubActivity(args) {
    const repo = resolveRepo(args.repo_path);
    if ("error" in repo)
        return error(repo.error);
    const context = (0, db_1.loadContext)(repo.path);
    if (!context?.githubToken) {
        return error("No GitHub token in .git-impact/context.json. " +
            'Call update_context with github_token first.');
    }
    const since = args.since_iso ? new Date(args.since_iso) : (0, git_1.startOfDay)();
    const until = args.until_iso ? new Date(args.until_iso) : new Date();
    try {
        const simpleGit = (await Promise.resolve().then(() => __importStar(require("simple-git")))).default;
        const remotes = await simpleGit(repo.path).getRemotes(true);
        const remoteUrl = remotes.find((r) => r.name === "origin")?.refs?.fetch;
        if (!remoteUrl)
            return error("No origin remote found.");
        const github = await (0, github_1.readGitHubActivity)(context.githubToken, remoteUrl, since, until);
        if (!github)
            return error("Could not parse GitHub repo from remote URL.");
        return ok(JSON.stringify(github, null, 2));
    }
    catch (err) {
        return error(`GitHub fetch failed: ${err.message}`);
    }
}
function handleSaveImpactEntry(args) {
    const repo = resolveRepo(args.repo_path);
    if ("error" in repo)
        return error(repo.error);
    try {
        const id = (0, db_1.saveEntry)({
            date: args.date,
            repoPath: repo.path,
            repoName: args.repo_name,
            totalCommits: args.total_commits || 0,
            totalFiles: args.total_files || 0,
            filesSummary: args.files_summary || "",
            items: args.items || [],
            rawJson: JSON.stringify(args.items),
            createdAt: new Date().toISOString(),
        }, repo.path);
        return ok(JSON.stringify({ saved: true, id, repo: repo.path }));
    }
    catch (err) {
        return error(`Failed to save entry: ${err.message}`);
    }
}
function handleGetHistory(args) {
    const repo = resolveRepo(args.repo_path);
    if ("error" in repo)
        return error(repo.error);
    try {
        const entries = args.from_date && args.to_date
            ? (0, db_1.getEntriesForRange)(args.from_date, args.to_date, repo.path)
            : (0, db_1.getEntriesForDaysAgo)(args.last_days || 30, repo.path);
        return ok(JSON.stringify(entries, null, 2));
    }
    catch (err) {
        return error(`Failed to read history: ${err.message}`);
    }
}
function handleUpdateContext(args) {
    const repo = resolveRepo(args.repo_path);
    if ("error" in repo)
        return error(repo.error);
    const existing = (0, db_1.loadContext)(repo.path) ?? {
        companyDescription: "",
        managerPriorities: "",
        glossary: {},
    };
    const updated = {
        companyDescription: args.company_description ?? existing.companyDescription,
        managerPriorities: args.manager_priorities ?? existing.managerPriorities,
        glossary: args.glossary ?? existing.glossary,
        githubToken: args.github_token ?? existing.githubToken,
        anthropicApiKey: args.anthropic_api_key ?? existing.anthropicApiKey,
    };
    try {
        (0, db_1.saveContext)(updated, repo.path);
        return ok(JSON.stringify({
            saved: true,
            location: `${repo.path}/.git-impact/context.json`,
            context: {
                ...updated,
                githubToken: updated.githubToken ? "***" : undefined,
                anthropicApiKey: updated.anthropicApiKey ? "***" : undefined,
            },
        }, null, 2));
    }
    catch (err) {
        return error(`Failed to save context: ${err.message}`);
    }
}
// ─── Repo resolution helper ───────────────────────────────────────────────────
function resolveRepo(explicitPath) {
    try {
        const { path } = (0, repo_1.resolveRepoPath)(explicitPath);
        return { path };
    }
    catch (err) {
        return { error: err.message };
    }
}
// ─── Response helpers ─────────────────────────────────────────────────────────
function ok(text) {
    return { content: [{ type: "text", text }] };
}
function error(message) {
    return { content: [{ type: "text", text: message }], isError: true };
}
//# sourceMappingURL=tools.js.map