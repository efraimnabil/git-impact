#!/usr/bin/env node
import { Command } from "commander";
import * as path from "path";
import * as process from "process";
import { loadContext, saveContext, UserContext } from "../storage/db";
import { resolveRepoPath } from "../mcp/repo";
import { install, runInitWizard } from "../init/installer";
import { renderReport } from "../report/render";

// __dirname is dist/cli/ at runtime → ../../package.json is the package root.
const { version: PKG_VERSION } = require(path.resolve(__dirname, "..", "..", "package.json"));

const program = new Command();

program
  .name("git-impact")
  .description("Install git-impact into a repo. Translation runs inside your AI editor (Claude Code skill / MCP) — no API key.")
  .version(PKG_VERSION);

// ─── init ─────────────────────────────────────────────────────────────────────

program
  .command("init")
  .description("Install git-impact into this repo and set up personalization context")
  .option("-p, --path <path>", "Path to git repository (auto-detected if omitted)")
  .action(async (opts) => {
    const repoRoot = getRepoOrDie(opts.path);
    const existing = loadContext(repoRoot);

    const { context, integrations } = await runInitWizard(repoRoot);

    const fullContext: UserContext = {
      ...context,
      githubToken: existing?.githubToken,
    };
    saveContext(fullContext, repoRoot);

    const installed = install({ repoRoot, integrations, context, silent: false });

    console.log(`\n  ${"─".repeat(36)}`);
    console.log(`  git-impact installed\n`);
    for (const f of installed) {
      const rel  = path.relative(repoRoot, f.path);
      const icon =
        f.action === "created" ? "✅" :
        f.action === "updated" ? "🔄" :
        f.action === "removed" ? "🗑️ " :
                                 "⏭️ ";
      console.log(`  ${icon}  ${rel}`);
    }

    // Editor-aware next-step hint based on what we actually installed.
    const trigger =
      integrations.includes("claude")   ? `In Claude Code: type "/git-impact" or say "do my standup"`  :
      integrations.includes("gemini")   ? `In Gemini CLI: run "/git-impact" (or say "do my standup")`   :
      integrations.includes("cursor")   ? `In Cursor chat: paste "@git-impact do my standup"`            :
      integrations.includes("copilot")  ? `In Copilot Chat: open this repo and say "do my standup"`     :
      integrations.includes("opencode") ? `In OpenCode: open this repo and say "do my standup"`         :
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
    const result = renderReport({
      repoRoot,
      open: opts.open !== false,
      date: opts.date,
    });
    if (result.entryCount === 0) {
      console.log(
        `\nNo standups saved yet for ${repoRoot}.\n` +
        `In Claude Code, say "do my standup" to build history.\n` +
        `Empty report still written to: ${result.htmlPath}\n`
      );
      return;
    }
    console.log(`\nReport regenerated — ${result.entryCount} standup(s)`);
    console.log(`  ${result.url}\n`);
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRepoOrDie(explicitPath?: string): string {
  try {
    return resolveRepoPath(explicitPath).path;
  } catch (err) {
    console.error(`\nError: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

program.parse(process.argv);
