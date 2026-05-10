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
const path = __importStar(require("path"));
const process = __importStar(require("process"));
const db_1 = require("../storage/db");
const repo_1 = require("../mcp/repo");
const installer_1 = require("../init/installer");
const render_1 = require("../report/render");
const program = new commander_1.Command();
program
    .name("git-impact")
    .description("Install git-impact into a repo. Translation runs inside your AI editor (Claude Code skill / MCP) — no API key.")
    .version("0.6.0");
// ─── init ─────────────────────────────────────────────────────────────────────
program
    .command("init")
    .description("Install git-impact into this repo and set up personalization context")
    .option("-p, --path <path>", "Path to git repository (auto-detected if omitted)")
    .action(async (opts) => {
    const repoRoot = getRepoOrDie(opts.path);
    const existing = (0, db_1.loadContext)(repoRoot);
    const { context, integrations } = await (0, installer_1.runInitWizard)(repoRoot);
    const fullContext = {
        ...context,
        githubToken: existing?.githubToken,
    };
    (0, db_1.saveContext)(fullContext, repoRoot);
    const installed = (0, installer_1.install)({ repoRoot, integrations, context, silent: false });
    console.log(`\n  ${"─".repeat(36)}`);
    console.log(`  git-impact installed\n`);
    for (const f of installed) {
        const rel = path.relative(repoRoot, f.path);
        const icon = f.action === "created" ? "✅" : f.action === "updated" ? "🔄" : "⏭️ ";
        console.log(`  ${icon}  ${rel}`);
    }
    // Editor-aware next-step hint based on what we actually installed.
    const trigger = integrations.includes("claude") ? `In Claude Code: type "/git-impact" or say "do my standup"` :
        integrations.includes("gemini") ? `In Gemini CLI: run "/git-impact" (or say "do my standup")` :
            integrations.includes("cursor") ? `In Cursor chat: paste "@git-impact do my standup"` :
                integrations.includes("copilot") ? `In Copilot Chat: open this repo and say "do my standup"` :
                    `Open this repo in your AI editor and say "do my standup"`;
    console.log(`\n  Next steps:`);
    console.log(`  1. git add .git-impact/context.json && git commit -m "chore: add git-impact"`);
    console.log(`  2. ${trigger}`);
    console.log(`  3. After a few standups: \`git-impact view\` to see the rolling dashboard\n`);
});
// ─── view ─────────────────────────────────────────────────────────────────────
program
    .command("view")
    .description("Generate / open the HTML report of saved standups")
    .option("-p, --path <path>", "Path to git repository (auto-detected if omitted)")
    .option("--date <date>", "Focus a specific date (YYYY-MM-DD) — opens that day directly")
    .option("--no-open", "Just regenerate the file, don't open the browser")
    .action((opts) => {
    const repoRoot = getRepoOrDie(opts.path);
    const result = (0, render_1.renderReport)({
        repoRoot,
        open: opts.open !== false,
        date: opts.date,
    });
    if (result.entryCount === 0) {
        console.log(`\nNo standups saved yet for ${repoRoot}.\n` +
            `In Claude Code, say "do my standup" to build history.\n` +
            `Empty report still written to: ${result.htmlPath}\n`);
        return;
    }
    console.log(`\nReport regenerated — ${result.entryCount} standup(s)`);
    console.log(`  ${result.url}\n`);
});
// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRepoOrDie(explicitPath) {
    try {
        return (0, repo_1.resolveRepoPath)(explicitPath).path;
    }
    catch (err) {
        console.error(`\nError: ${err.message}\n`);
        process.exit(1);
    }
}
program.parse(process.argv);
//# sourceMappingURL=index.js.map