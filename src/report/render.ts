/**
 * Reads history.db, writes `.git-impact/result.html`, optionally opens in browser.
 * Wired into the `git-impact view` CLI and the Claude Code skill (post-standup hook).
 */

import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { getEntriesForRange } from "../storage/db";
import { renderReportHtml, ReportEntry } from "./html";

export interface RenderOptions {
  repoRoot: string;
  open?: boolean;
  date?: string; // optional ?date=YYYY-MM-DD focus
}

export interface RenderResult {
  htmlPath: string;
  url: string;
  entryCount: number;
}

export function renderReport(opts: RenderOptions): RenderResult {
  const { repoRoot, open = false, date } = opts;

  // Pull every saved standup. Wide date range is intentional — a few thousand
  // rows is fine for inline-embedding in a single static file.
  const entries = getEntriesForRange("0000-01-01", "9999-12-31", repoRoot);
  const repoName = entries[0]?.repoName ?? path.basename(repoRoot);

  const reportEntries: ReportEntry[] = entries.map((e) => ({
    date: e.date,
    repoName: e.repoName,
    totalCommits: e.totalCommits,
    totalFiles: e.totalFiles,
    filesSummary: e.filesSummary,
    items: e.items.map((it) => ({
      status: it.status,
      summary: it.summary,
      impact: it.impact,
      technical_note: it.technical_note,
    })),
  }));

  const html = renderReportHtml(reportEntries, repoName);

  const outDir = path.join(repoRoot, ".git-impact");
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, "result.html");
  fs.writeFileSync(htmlPath, html, "utf-8");

  const url = `file://${htmlPath}${date ? `?date=${date}` : ""}`;

  if (open) {
    openInBrowser(url);
  }

  return { htmlPath, url, entryCount: entries.length };
}

function openInBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? "open" :
    platform === "win32"  ? "cmd"  :
    "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];

  // Detached so we don't block the CLI; ignore errors silently — the URL is
  // printed regardless so the user can copy-paste.
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* no-op */
  }
}
