#!/usr/bin/env node
import { Command } from "commander";
import * as readline from "readline";
import * as path from "path";
import * as process from "process";
import { readGitActivity, startOfDay, startOfDaysAgo } from "../readers/git";
import { readGitHubActivity } from "../readers/github";
import { translateActivity, generateReview } from "../translator/translate";
import {
  saveEntry,
  loadContext,
  saveContext,
  getEntriesForDaysAgo,
  getEntriesForRange,
  UserContext,
} from "../storage/db";
import { resolveRepoPath } from "../mcp/repo";
import { install, runInitWizard } from "../init/installer";
import { renderReport } from "../report/render";

const program = new Command();

program
  .name("git-impact")
  .description("Translate git commits into plain-English business impact")
  .version("0.2.1");

// ─── today ────────────────────────────────────────────────────────────────────

program
  .command("today")
  .description("Translate today's commits into business impact")
  .option("-p, --path <path>", "Path to git repository (auto-detected if omitted)")
  .option("--no-github", "Skip GitHub PR data")
  .option("--no-save", "Don't save result to local history")
  .action(async (opts) => {
    const repoRoot = getRepoOrDie(opts.path);
    const context  = loadContext(repoRoot);
    const since    = startOfDay();
    const until    = new Date();
    const dateLabel = formatDate(until);

    process.stdout.write(`\nRepo: ${repoRoot}\nReading git activity...\n`);

    const git = await readGitActivity(repoRoot, since, until).catch((err) =>
      die(`Could not read git history: ${(err as Error).message}`)
    );

    if (git.commits.length === 0) {
      console.log(`\n${dateLabel}\n\nNo commits today.\n`);
      return;
    }

    let github = null;
    if (opts.github && context?.githubToken) {
      process.stdout.write("Fetching GitHub PR data...\n");
      const remoteUrl = await getRemoteUrl(repoRoot);
      if (remoteUrl) {
        github = await readGitHubActivity(context.githubToken, remoteUrl, since, until).catch(() => null);
      }
    }

    process.stdout.write("Translating with Claude...\n\n");
    const result = await translateActivity(git, github, context, dateLabel);
    printResult(dateLabel, result, git);

    if (opts.save !== false) {
      const today = until.toISOString().slice(0, 10);
      saveEntry(
        {
          date: today,
          repoPath: repoRoot,
          repoName: git.repoName,
          totalCommits: result.totalCommits,
          totalFiles:   result.totalFiles,
          filesSummary: result.filesSummary,
          items:        result.items,
          rawJson:      result.rawJson,
          createdAt:    new Date().toISOString(),
        },
        repoRoot
      );
      // Regenerate HTML report so the user always has a fresh file:// link to share.
      const report = renderReport({ repoRoot, open: false, date: today });
      console.log(`🔗 ${report.url}\n`);
    }
  });

// ─── since ────────────────────────────────────────────────────────────────────

program
  .command("since <when>")
  .description('Translate commits since a period — "yesterday", "3d", "2026-05-01"')
  .option("-p, --path <path>", "Path to git repository (auto-detected if omitted)")
  .action(async (when: string, opts) => {
    const repoRoot  = getRepoOrDie(opts.path);
    const context   = loadContext(repoRoot);
    const since     = parseWhen(when);
    const until     = new Date();
    const dateLabel = `${formatDate(since)} → ${formatDate(until)}`;

    process.stdout.write(`\nRepo: ${repoRoot}\nReading commits since ${formatDate(since)}...\n`);

    const git = await readGitActivity(repoRoot, since, until).catch((err) =>
      die(`Could not read git history: ${(err as Error).message}`)
    );

    if (git.commits.length === 0) {
      console.log(`\nNo commits found since ${formatDate(since)}.\n`);
      return;
    }

    process.stdout.write("Translating with Claude...\n\n");
    const result = await translateActivity(git, null, context, dateLabel);
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
    const context  = loadContext(repoRoot);

    let entries;
    let periodLabel: string;

    if (opts.quarter) {
      const { from, to } = parseQuarter(opts.quarter);
      entries     = getEntriesForRange(from, to, repoRoot);
      periodLabel = opts.quarter;
    } else {
      const days  = parseInt(opts.last, 10);
      entries     = getEntriesForDaysAgo(days, repoRoot);
      periodLabel = `Last ${days} days`;
    }

    if (entries.length === 0) {
      console.log(`\nNo saved history for ${periodLabel} in ${repoRoot}.\nRun \`git-impact today\` daily to build history.\n`);
      return;
    }

    process.stdout.write(`\nGenerating review for ${periodLabel} (${entries.length} days)...\n\n`);
    const review = await generateReview(entries, context, periodLabel);

    console.log(`\nPerformance Review — ${review.period}`);
    console.log("=".repeat(50));
    console.log(`\n${review.headline}\n`);

    for (const theme of review.themes) {
      const icon = theme.impact_level === "high" ? "🚀" : theme.impact_level === "medium" ? "✅" : "🔧";
      console.log(`\n${icon} ${theme.name}`);
      for (const bullet of theme.bullets) console.log(`   • ${bullet}`);
    }

    console.log("\n" + "─".repeat(50));
    console.log(`📊 ${review.stats.total_commits} commits across ${review.stats.working_days} working days\n`);
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
        `Run \`git-impact today\` (or "do my standup" in Claude Code) to build history.\n` +
        `Empty report still written to: ${result.htmlPath}\n`
      );
      return;
    }
    console.log(`\nReport regenerated — ${result.entryCount} standup(s)`);
    console.log(`  ${result.url}\n`);
  });

// ─── init ─────────────────────────────────────────────────────────────────────

program
  .command("init")
  .description("Install git-impact into this repo and set up personalization context")
  .option("-p, --path <path>", "Path to git repository (auto-detected if omitted)")
  .action(async (opts) => {
    const repoRoot = getRepoOrDie(opts.path);
    const existing = loadContext(repoRoot);

    // Run the interactive wizard (company desc, manager priorities, glossary, integrations)
    const { context, integrations } = await runInitWizard(repoRoot);

    // Ask for CLI-specific secrets (not committed, stored in context.json locally)
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

    const anthropicApiKey = await ask(
      `\n  Anthropic API key (for CLI translate mode — not needed for Claude Code)\n` +
      (existing?.anthropicApiKey ? `  [already set, press Enter to keep]\n` : `  [leave blank to skip for now]\n`) +
      `  > `
    );
    const githubToken = await ask(
      `\n  GitHub token (optional — enriches output with PR titles)\n` +
      (existing?.githubToken ? `  [already set, press Enter to keep]\n` : `  [leave blank to skip]\n`) +
      `  > `
    );

    rl.close();

    // Merge CLI-only secrets into context and persist
    const fullContext: UserContext = {
      ...context,
      anthropicApiKey: anthropicApiKey.trim() || existing?.anthropicApiKey,
      githubToken:     githubToken.trim()     || existing?.githubToken,
    };
    saveContext(fullContext, repoRoot);

    // Install all integration files (SKILL.md, Copilot instructions, Cursor rules, etc.)
    const installed = install({ repoRoot, integrations, context, silent: false });

    // Print summary
    console.log(`\n  ${"─".repeat(36)}`);
    console.log(`  git-impact installed\n`);
    for (const f of installed) {
      const rel  = path.relative(repoRoot, f.path);
      const icon = f.action === "created" ? "✅" : f.action === "updated" ? "🔄" : "⏭️ ";
      console.log(`  ${icon}  ${rel}`);
    }
    console.log(`\n  Next steps:`);
    console.log(`  1. git add .git-impact/context.json .claude/ && git commit -m "chore: add git-impact"`);
    console.log(`  2. In Claude Code, say: "do my standup"\n`);
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRepoOrDie(explicitPath?: string): string {
  try {
    return resolveRepoPath(explicitPath).path;
  } catch (err) {
    die((err as Error).message);
  }
}

function printResult(
  dateLabel: string,
  result: Awaited<ReturnType<typeof translateActivity>>,
  git: Awaited<ReturnType<typeof readGitActivity>>
) {
  console.log(`📅 ${dateLabel}\n`);
  if (result.items.length === 0) {
    console.log("No significant changes to report.");
  } else {
    for (const item of result.items) {
      const icon = item.status === "done" ? "✅" : "⏳";
      console.log(`${icon} ${item.summary}`);
      if (item.impact)         console.log(`   → ${item.impact}`);
      if (item.technical_note) console.log(`   (${item.technical_note})`);
      console.log("");
    }
  }
  if (result.filesSummary) {
    console.log(`📁 ${git.totalFilesChanged} files — ${result.filesSummary}`);
  }
  console.log(`   ${git.commits.length} commit(s) on ${git.branch}\n`);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function parseWhen(when: string): Date {
  if (when === "yesterday") return startOfDaysAgo(1);
  const daysMatch = when.match(/^(\d+)d$/);
  if (daysMatch) return startOfDaysAgo(parseInt(daysMatch[1], 10));
  const parsed = new Date(when);
  if (!isNaN(parsed.getTime())) return parsed;
  die(`Could not parse date: "${when}". Try "yesterday", "3d", or "2026-05-01".`);
}

function parseQuarter(q: string): { from: string; to: string } {
  const match = q.match(/^Q([1-4])-(\d{4})$/i);
  if (!match) die(`Invalid quarter format. Use Q1-2026, Q2-2026, etc.`);
  const quarter = parseInt(match![1], 10);
  const year    = parseInt(match![2], 10);
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth   = startMonth + 2;
  const from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(year, endMonth, 0).getDate();
  const to   = `${year}-${String(endMonth).padStart(2, "0")}-${lastDay}`;
  return { from, to };
}

async function getRemoteUrl(repoPath: string): Promise<string | null> {
  const simpleGit = await import("simple-git").then((m) => m.default);
  const remotes = await simpleGit(repoPath).getRemotes(true).catch(() => []);
  return remotes.find((r) => r.name === "origin")?.refs?.fetch ?? null;
}

function die(msg: string): never {
  console.error(`\nError: ${msg}\n`);
  process.exit(1);
}

program.parse(process.argv);
