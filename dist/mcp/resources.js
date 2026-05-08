"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESOURCE_DEFINITIONS = void 0;
exports.handleReadResource = handleReadResource;
const db_1 = require("../storage/db");
const repo_1 = require("./repo");
const CONTEXT_URI = "git-impact://context";
const HISTORY_URI = "git-impact://history/overview";
exports.RESOURCE_DEFINITIONS = [
    {
        uri: CONTEXT_URI,
        name: "Project Context",
        description: "This repo's personalization: company description, manager priorities, and glossary. " +
            "Stored in .git-impact/context.json — committable and team-shareable. " +
            "Claude reads this automatically when translating commits.",
        mimeType: "application/json",
    },
    {
        uri: HISTORY_URI,
        name: "History Overview",
        description: "Summary of saved standup entries for the current repo: date range, total commits, days tracked. " +
            "Check before generating a performance review to confirm enough history exists.",
        mimeType: "application/json",
    },
];
function handleReadResource(uri) {
    // Resolve repo for both resources — safe to fail gracefully
    let repoRoot = null;
    try {
        repoRoot = (0, repo_1.resolveRepoPath)().path;
    }
    catch {
        // repo not found — return a helpful message rather than throwing
    }
    switch (uri) {
        case CONTEXT_URI:
            return readContextResource(repoRoot);
        case HISTORY_URI:
            return readHistoryResource(repoRoot);
        default:
            throw new Error(`Unknown resource URI: ${uri}`);
    }
}
function readContextResource(repoRoot) {
    const payload = repoRoot
        ? (() => {
            const ctx = (0, db_1.loadContext)(repoRoot);
            return ctx
                ? {
                    configured: true,
                    repo: repoRoot,
                    location: `${repoRoot}/.git-impact/context.json`,
                    company_description: ctx.companyDescription,
                    manager_priorities: ctx.managerPriorities,
                    glossary: ctx.glossary,
                    has_github_token: Boolean(ctx.githubToken),
                    has_anthropic_key: Boolean(ctx.anthropicApiKey),
                }
                : {
                    configured: false,
                    repo: repoRoot,
                    location: `${repoRoot}/.git-impact/context.json`,
                    message: "No context yet. Ask the user to describe their company and priorities, " +
                        "then call update_context to save them.",
                };
        })()
        : {
            configured: false,
            message: "No git repository detected. Open a project first.",
        };
    return {
        contents: [{ uri: CONTEXT_URI, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
    };
}
function readHistoryResource(repoRoot) {
    const payload = repoRoot
        ? (() => {
            const entries = (0, db_1.getEntriesForDaysAgo)(365, repoRoot);
            return entries.length === 0
                ? {
                    total_entries: 0,
                    repo: repoRoot,
                    message: "No history saved yet. Run the standup prompt daily to build history.",
                }
                : {
                    total_entries: entries.length,
                    repo: repoRoot,
                    earliest_date: entries[0].date,
                    latest_date: entries[entries.length - 1].date,
                    total_commits: entries.reduce((s, e) => s + e.totalCommits, 0),
                };
        })()
        : { total_entries: 0, message: "No git repository detected." };
    return {
        contents: [{ uri: HISTORY_URI, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
    };
}
//# sourceMappingURL=resources.js.map