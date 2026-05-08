"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROMPT_DEFINITIONS = void 0;
exports.handleGetPrompt = handleGetPrompt;
const git_1 = require("../readers/git");
const db_1 = require("../storage/db");
const repo_1 = require("./repo");
// ─── Prompt definitions ───────────────────────────────────────────────────────
// Computed slash commands: fetch live data, embed it + translation instructions,
// return as a pre-filled message so Claude Code does the AI work in its own
// session — no separate API key needed.
exports.PROMPT_DEFINITIONS = [
    {
        name: "standup",
        description: "Translate today's commits into a plain-English standup. " +
            "Auto-detects the open project — no path needed. " +
            "Reads .git-impact/context.json for your glossary and company context.",
        arguments: [
            {
                name: "since",
                description: '"today" (default), "yesterday", "3d", or ISO date "2026-05-01"',
                required: false,
            },
        ],
    },
    {
        name: "review",
        description: "Synthesize saved standup history into a performance review. " +
            "Auto-detects the open project. Reads from .git-impact/history.db.",
        arguments: [
            {
                name: "period",
                description: '"30d" (default), "90d", "Q1-2026", etc.',
                required: false,
            },
        ],
    },
];
// ─── Handlers ─────────────────────────────────────────────────────────────────
async function handleGetPrompt(name, args) {
    switch (name) {
        case "standup": return buildStandupPrompt(args ?? {});
        case "review": return buildReviewPrompt(args ?? {});
        default: throw new Error(`Unknown prompt: ${name}`);
    }
}
// ─── standup ──────────────────────────────────────────────────────────────────
async function buildStandupPrompt(args) {
    // Resolve repo — auto-detects open project via cwd
    let repoRoot;
    try {
        repoRoot = (0, repo_1.resolveRepoPath)().path;
    }
    catch (err) {
        return promptError(err.message);
    }
    const since = parseSince(args.since || "today");
    const until = new Date();
    const context = (0, db_1.loadContext)(repoRoot);
    let git;
    try {
        git = await (0, git_1.readGitActivity)(repoRoot, since, until);
    }
    catch {
        return promptError(`Could not read git history at ${repoRoot}.`);
    }
    if (git.commits.length === 0) {
        return singleMessage("No commits found", `No commits found since ${since.toDateString()} in ${git.repoName}. Nothing to translate.`);
    }
    const dateLabel = since.toDateString() === (0, git_1.startOfDay)().toDateString()
        ? `Today, ${until.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`
        : `${since.toDateString()} → ${until.toDateString()}`;
    const contextSection = context
        ? [
            "## Personalization Context",
            `Company: ${context.companyDescription || "(not set)"}`,
            `Manager priorities: ${context.managerPriorities || "(not set)"}`,
            Object.keys(context.glossary ?? {}).length > 0
                ? `Glossary:\n${Object.entries(context.glossary).map(([k, v]) => `  ${k} → ${v}`).join("\n")}`
                : "",
        ]
            .filter(Boolean)
            .join("\n")
        : "No .git-impact/context.json found. Use general technical language.\n" +
            'Tip: say "set up context for this repo" to configure your glossary.';
    const commitsSection = git.commits
        .map((c) => `- [${c.hash}] ${c.message}` +
        (c.body ? `\n  ${c.body.split("\n")[0]}` : "") +
        (c.filesChanged.length
            ? `\n  Files: ${c.filesChanged.slice(0, 6).join(", ")}${c.filesChanged.length > 6 ? ` (+${c.filesChanged.length - 6} more)` : ""}`
            : ""))
        .join("\n");
    const userMessage = `
# Standup Translation — ${dateLabel}

## Git Activity
Repo: ${git.repoName} (branch: ${git.branch})
Files changed: ${git.totalFilesChanged} | Commits: ${git.commits.length}

### Commits
${commitsSection}

${contextSection}

## Your Task

Translate the commits above into 2–5 plain-English bullets for a standup or manager update.

**Rules:**
1. Each bullet = what was done + why it matters to the business. Never restate the commit message verbatim.
2. Apply the glossary — replace every technical term listed above with its plain-English equivalent.
3. If you can't infer business impact confidently, say what was done and call it "technical foundation work for X".
4. WIP / draft work → prefix "⏳ In progress:" and state the expected outcome.
5. Group related commits into one bullet if they tell the same story.
6. Be specific — "improved performance" is too vague without a number or context.
7. End with: "📁 N files changed across [brief area]"

**Format:**
✅ [Plain English summary]
   → [Business impact / who it unblocks / risk reduced]

⏳ [In-progress work]
   → [Expected outcome]
`.trim();
    return {
        description: `Standup for ${dateLabel} — ${git.repoName}`,
        messages: [{ role: "user", content: { type: "text", text: userMessage } }],
    };
}
// ─── review ───────────────────────────────────────────────────────────────────
async function buildReviewPrompt(args) {
    let repoRoot;
    try {
        repoRoot = (0, repo_1.resolveRepoPath)().path;
    }
    catch (err) {
        return promptError(err.message);
    }
    const period = args.period || "30d";
    const context = (0, db_1.loadContext)(repoRoot);
    let entries;
    let periodLabel;
    if (/^Q[1-4]-\d{4}$/i.test(period)) {
        const { from, to } = parseQuarter(period);
        entries = (0, db_1.getEntriesForRange)(from, to, repoRoot);
        periodLabel = period.toUpperCase();
    }
    else {
        const days = parseDays(period);
        entries = (0, db_1.getEntriesForDaysAgo)(days, repoRoot);
        periodLabel = `Last ${days} days`;
    }
    if (entries.length === 0) {
        return singleMessage("No history found", `No saved history for "${period}" in ${repoRoot}.\n\n` +
            "Use the standup prompt daily to build history, then come back for a review.");
    }
    const historySection = entries
        .map((e) => `### ${e.date} — ${e.repoName} (${e.totalCommits} commits)\n` +
        e.items.map((i) => `- [${i.status}] ${i.summary}. ${i.impact}`).join("\n"))
        .join("\n\n");
    const contextSection = context?.companyDescription
        ? `Company: ${context.companyDescription}\nManager priorities: ${context.managerPriorities || "(not set)"}`
        : "";
    const totalCommits = entries.reduce((s, e) => s + e.totalCommits, 0);
    const userMessage = `
# Performance Review — ${periodLabel}

${contextSection}

## Work Log (${entries.length} days | ${totalCommits} total commits)

${historySection}

## Your Task

Synthesize the work log into a structured performance review summary.

**Instructions:**
1. Group by theme: "Features shipped", "Reliability & bugs", "Security", "Code review", "Infrastructure", "Developer experience" — use only themes that apply.
2. Within each theme: specific bullets with numbers when available. No generic summaries.
3. Assign each theme: high / medium / low impact.
4. One headline sentence capturing the biggest contribution this period.
5. Stats block at the end.

**Format:**

## [Headline sentence]

### 🚀 [Theme — high impact]
- Specific achievement...

### ✅ [Theme — medium impact]
- ...

### 🔧 [Theme — low impact]
- ...

---
📊 ${entries.length} days | ${totalCommits} commits | [other notable stats]
`.trim();
    return {
        description: `Performance review for ${periodLabel} — ${repoRoot.split("/").pop()}`,
        messages: [{ role: "user", content: { type: "text", text: userMessage } }],
    };
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseSince(when) {
    if (when === "today")
        return (0, git_1.startOfDay)();
    if (when === "yesterday")
        return (0, git_1.startOfDaysAgo)(1);
    const daysMatch = when.match(/^(\d+)d$/);
    if (daysMatch)
        return (0, git_1.startOfDaysAgo)(parseInt(daysMatch[1], 10));
    const parsed = new Date(when);
    return isNaN(parsed.getTime()) ? (0, git_1.startOfDay)() : parsed;
}
function parseDays(period) {
    const match = period.match(/^(\d+)d$/);
    return match ? parseInt(match[1], 10) : 30;
}
function parseQuarter(q) {
    const match = q.match(/^Q([1-4])-(\d{4})$/i);
    const quarter = parseInt(match[1], 10);
    const year = parseInt(match[2], 10);
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(year, endMonth, 0).getDate();
    const to = `${year}-${String(endMonth).padStart(2, "0")}-${lastDay}`;
    return { from, to };
}
function promptError(message) {
    return singleMessage("Error", `Error: ${message}`);
}
function singleMessage(description, text) {
    return {
        description,
        messages: [{ role: "user", content: { type: "text", text } }],
    };
}
//# sourceMappingURL=prompts.js.map