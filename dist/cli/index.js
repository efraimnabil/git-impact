#!/usr/bin/env node
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
const commander_1 = require("commander");
const readline = __importStar(require("readline"));
const process = __importStar(require("process"));
const git_1 = require("../readers/git");
const github_1 = require("../readers/github");
const translate_1 = require("../translator/translate");
const db_1 = require("../storage/db");
const repo_1 = require("../mcp/repo");
const program = new commander_1.Command();
program
    .name("git-impact")
    .description("Translate git commits into plain-English business impact")
    .version("0.1.0");
// ─── today ────────────────────────────────────────────────────────────────────
program
    .command("today")
    .description("Translate today's commits into business impact")
    .option("-p, --path <path>", "Path to git repository (auto-detected if omitted)")
    .option("--no-github", "Skip GitHub PR data")
    .option("--no-save", "Don't save result to local history")
    .action(async (opts) => {
    const repoRoot = getRepoOrDie(opts.path);
    const context = (0, db_1.loadContext)(repoRoot);
    const since = (0, git_1.startOfDay)();
    const until = new Date();
    const dateLabel = formatDate(until);
    process.stdout.write(`\nRepo: ${repoRoot}\nReading git activity...\n`);
    const git = await (0, git_1.readGitActivity)(repoRoot, since, until).catch((err) => die(`Could not read git history: ${err.message}`));
    if (git.commits.length === 0) {
        console.log(`\n${dateLabel}\n\nNo commits today.\n`);
        return;
    }
    let github = null;
    if (opts.github && context?.githubToken) {
        process.stdout.write("Fetching GitHub PR data...\n");
        const remoteUrl = await getRemoteUrl(repoRoot);
        if (remoteUrl) {
            github = await (0, github_1.readGitHubActivity)(context.githubToken, remoteUrl, since, until).catch(() => null);
        }
    }
    process.stdout.write("Translating with Claude...\n\n");
    const result = await (0, translate_1.translateActivity)(git, github, context, dateLabel);
    printResult(dateLabel, result, git);
    if (opts.save !== false) {
        (0, db_1.saveEntry)({
            date: until.toISOString().slice(0, 10),
            repoPath: repoRoot,
            repoName: git.repoName,
            totalCommits: result.totalCommits,
            totalFiles: result.totalFiles,
            filesSummary: result.filesSummary,
            items: result.items,
            rawJson: result.rawJson,
            createdAt: new Date().toISOString(),
        }, repoRoot);
    }
});
// ─── since ────────────────────────────────────────────────────────────────────
program
    .command("since <when>")
    .description('Translate commits since a period — "yesterday", "3d", "2026-05-01"')
    .option("-p, --path <path>", "Path to git repository (auto-detected if omitted)")
    .action(async (when, opts) => {
    const repoRoot = getRepoOrDie(opts.path);
    const context = (0, db_1.loadContext)(repoRoot);
    const since = parseWhen(when);
    const until = new Date();
    const dateLabel = `${formatDate(since)} → ${formatDate(until)}`;
    process.stdout.write(`\nRepo: ${repoRoot}\nReading commits since ${formatDate(since)}...\n`);
    const git = await (0, git_1.readGitActivity)(repoRoot, since, until).catch((err) => die(`Could not read git history: ${err.message}`));
    if (git.commits.length === 0) {
        console.log(`\nNo commits found since ${formatDate(since)}.\n`);
        return;
    }
    process.stdout.write("Translating with Claude...\n\n");
    const result = await (0, translate_1.translateActivity)(git, null, context, dateLabel);
    printResult(dateLabel, result, git);
});
// ─── review ───────────────────────────────────────────────────────────────────
program
    .command("review")
    .description("Generate a performance review from saved history")
    .option("-p, --path <path>", "Path to git repository (auto-detected if omitted)")
    .option("--last <days>", "Days to look back", "90")
    .option("--quarter <q>", "Quarter e.g. Q2-2026")
    .action(async (opts) => {
    const repoRoot = getRepoOrDie(opts.path);
    const context = (0, db_1.loadContext)(repoRoot);
    let entries;
    let periodLabel;
    if (opts.quarter) {
        const { from, to } = parseQuarter(opts.quarter);
        entries = (0, db_1.getEntriesForRange)(from, to, repoRoot);
        periodLabel = opts.quarter;
    }
    else {
        const days = parseInt(opts.last, 10);
        entries = (0, db_1.getEntriesForDaysAgo)(days, repoRoot);
        periodLabel = `Last ${days} days`;
    }
    if (entries.length === 0) {
        console.log(`\nNo saved history for ${periodLabel} in ${repoRoot}.\nRun \`git-impact today\` daily to build history.\n`);
        return;
    }
    process.stdout.write(`\nGenerating review for ${periodLabel} (${entries.length} days)...\n\n`);
    const review = await (0, translate_1.generateReview)(entries, context, periodLabel);
    console.log(`\nPerformance Review — ${review.period}`);
    console.log("=".repeat(50));
    console.log(`\n${review.headline}\n`);
    for (const theme of review.themes) {
        const icon = theme.impact_level === "high" ? "🚀" : theme.impact_level === "medium" ? "✅" : "🔧";
        console.log(`\n${icon} ${theme.name}`);
        for (const bullet of theme.bullets)
            console.log(`   • ${bullet}`);
    }
    console.log("\n" + "─".repeat(50));
    console.log(`📊 ${review.stats.total_commits} commits across ${review.stats.working_days} working days\n`);
});
// ─── init ─────────────────────────────────────────────────────────────────────
program
    .command("init")
    .description("Set up personalization context for this repo")
    .option("-p, --path <path>", "Path to git repository (auto-detected if omitted)")
    .action(async (opts) => {
    const repoRoot = getRepoOrDie(opts.path);
    const existing = (0, db_1.loadContext)(repoRoot);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((res) => rl.question(q, res));
    console.log(`\ngit-impact init — ${repoRoot}\n${"─".repeat(40)}`);
    console.log("Context is saved to .git-impact/context.json");
    console.log("You can commit it to share settings with your team.\n");
    const companyDescription = await ask(`What does your company/product do? (1-2 sentences)\n${existing?.companyDescription ? `[current: ${existing.companyDescription}]\n` : ""}> `);
    const managerPriorities = await ask(`\nWhat does your manager care most about?\n${existing?.managerPriorities ? `[current: ${existing.managerPriorities}]\n` : ""}> `);
    const glossaryInput = await ask(`\nTechnical terms to translate? Format: "RLS=data security, MFA=login security"\n${existing?.glossary ? `[current: ${Object.entries(existing.glossary).map(([k, v]) => `${k}=${v}`).join(", ")}]\n` : ""}(leave blank to skip)\n> `);
    const anthropicApiKey = await ask(`\nAnthropic API key (for CLI mode — not needed for Claude Code MCP)\n${existing?.anthropicApiKey ? "[already set, press Enter to keep]\n" : ""}> `);
    const githubToken = await ask(`\nGitHub token (optional, for PR data)\n${existing?.githubToken ? "[already set, press Enter to keep]\n" : "(leave blank to skip)\n"}> `);
    rl.close();
    const glossary = { ...(existing?.glossary ?? {}) };
    if (glossaryInput.trim()) {
        for (const pair of glossaryInput.split(",")) {
            const [term, meaning] = pair.split("=").map((s) => s.trim());
            if (term && meaning)
                glossary[term] = meaning;
        }
    }
    const ctx = {
        companyDescription: companyDescription.trim() || existing?.companyDescription || "",
        managerPriorities: managerPriorities.trim() || existing?.managerPriorities || "",
        glossary,
        anthropicApiKey: anthropicApiKey.trim() || existing?.anthropicApiKey,
        githubToken: githubToken.trim() || existing?.githubToken,
    };
    (0, db_1.saveContext)(ctx, repoRoot);
    console.log(`\nSaved to ${repoRoot}/.git-impact/context.json`);
    console.log("You can commit context.json to share it with your team.");
    console.log("history.db has been added to .gitignore automatically.\n");
});
// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRepoOrDie(explicitPath) {
    try {
        return (0, repo_1.resolveRepoPath)(explicitPath).path;
    }
    catch (err) {
        die(err.message);
    }
}
function printResult(dateLabel, result, git) {
    console.log(`📅 ${dateLabel}\n`);
    if (result.items.length === 0) {
        console.log("No significant changes to report.");
    }
    else {
        for (const item of result.items) {
            const icon = item.status === "done" ? "✅" : "⏳";
            console.log(`${icon} ${item.summary}`);
            if (item.impact)
                console.log(`   → ${item.impact}`);
            if (item.technical_note)
                console.log(`   (${item.technical_note})`);
            console.log("");
        }
    }
    if (result.filesSummary) {
        console.log(`📁 ${git.totalFilesChanged} files — ${result.filesSummary}`);
    }
    console.log(`   ${git.commits.length} commit(s) on ${git.branch}\n`);
}
function formatDate(d) {
    return d.toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
}
function parseWhen(when) {
    if (when === "yesterday")
        return (0, git_1.startOfDaysAgo)(1);
    const daysMatch = when.match(/^(\d+)d$/);
    if (daysMatch)
        return (0, git_1.startOfDaysAgo)(parseInt(daysMatch[1], 10));
    const parsed = new Date(when);
    if (!isNaN(parsed.getTime()))
        return parsed;
    die(`Could not parse date: "${when}". Try "yesterday", "3d", or "2026-05-01".`);
}
function parseQuarter(q) {
    const match = q.match(/^Q([1-4])-(\d{4})$/i);
    if (!match)
        die(`Invalid quarter format. Use Q1-2026, Q2-2026, etc.`);
    const quarter = parseInt(match[1], 10);
    const year = parseInt(match[2], 10);
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(year, endMonth, 0).getDate();
    const to = `${year}-${String(endMonth).padStart(2, "0")}-${lastDay}`;
    return { from, to };
}
async function getRemoteUrl(repoPath) {
    const simpleGit = await Promise.resolve().then(() => __importStar(require("simple-git"))).then((m) => m.default);
    const remotes = await simpleGit(repoPath).getRemotes(true).catch(() => []);
    return remotes.find((r) => r.name === "origin")?.refs?.fetch ?? null;
}
function die(msg) {
    console.error(`\nError: ${msg}\n`);
    process.exit(1);
}
program.parse(process.argv);
//# sourceMappingURL=index.js.map