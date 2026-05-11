import simpleGit, { DefaultLogFields, LogResult } from "simple-git";
import * as path from "path";
import { redactFilename, redactText, RedactConfig } from "./redact";

export interface CommitInfo {
  hash: string;
  date: string;
  message: string;
  author: string;
  body: string;
  /** Diff stats from `git diff --stat`. Omitted by default — set `includeDiff:true` to fetch. */
  diff?: string;
  /** Changed files. Capped to MAX_FILES_PER_COMMIT; check filesChangedTruncated for overflow. */
  filesChanged: string[];
  /** True when filesChanged was capped. The full count is in filesChangedCount. */
  filesChangedTruncated?: boolean;
  filesChangedCount?: number;
}

export interface GitSummary {
  commits: CommitInfo[];
  totalFilesChanged: number;
  repoName: string;
  branch: string;
  dateRange: { from: string; to: string };
  /** True when the commit list was capped to maxCommits. */
  commitsTruncated?: boolean;
  /** Total commits in the window, before any cap. */
  commitsTotal?: number;
}

export interface ReadGitOptions {
  /** Cap how many commits to return. Older commits drop off the end. Default 200. */
  maxCommits?: number;
  /** When true, include per-commit `--stat` diff text. Default false (saves tokens). */
  includeDiff?: boolean;
  /** Cap files-per-commit. Older commits with huge file lists get truncated. Default 50. */
  maxFilesPerCommit?: number;
}

const DEFAULTS: Required<ReadGitOptions> = {
  maxCommits: 200,
  includeDiff: false,
  maxFilesPerCommit: 50,
};

function stripCredentials(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return url.replace(/\/\/[^@]+@/, "//");
  }
}

export async function readGitActivity(
  repoPath: string,
  since: Date,
  until: Date = new Date(),
  redactCfg: RedactConfig = { enabled: true },
  options: ReadGitOptions = {}
): Promise<GitSummary> {
  const opts = { ...DEFAULTS, ...options };
  const git = simpleGit(repoPath);

  const sinceStr = since.toISOString();
  const untilStr = until.toISOString();

  const log: LogResult<DefaultLogFields> = await git.log([
    `--since=${sinceStr}`,
    `--until=${untilStr}`,
    "--author-date-order",
  ]);

  const remotes = await git.getRemotes(true);
  const originRemote = remotes.find((r) => r.name === "origin");
  const remoteUrl = originRemote?.refs?.fetch
    ? stripCredentials(originRemote.refs.fetch)
    : "";
  const repoName =
    remoteUrl
      .replace(/\.git$/, "")
      .split("/")
      .slice(-2)
      .join("/") || path.basename(repoPath);

  const branch = await git.revparse(["--abbrev-ref", "HEAD"]);

  // Cap commit count. Older commits drop off — newest-first is what users care about.
  const commitsTotal = log.all.length;
  const entries = log.all.slice(0, opts.maxCommits);
  const commitsTruncated = commitsTotal > entries.length;

  const commits: CommitInfo[] = await Promise.all(
    entries.map(async (entry) => {
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
        .map((f) => redactFilename(f, redactCfg));

      const filesChangedTruncated = allFiles.length > opts.maxFilesPerCommit;
      const filesChanged = filesChangedTruncated
        ? allFiles.slice(0, opts.maxFilesPerCommit)
        : allFiles;

      // Diff is opt-in — large diffs were the main culprit blowing past the
      // MCP token budget on big weeks. Most translations don't need them;
      // commit body + file list usually carries the signal.
      let diff: string | undefined;
      if (opts.includeDiff) {
        const raw = await git
          .diff([`${entry.hash}^`, entry.hash, "--stat"])
          .catch(() => git.show(["--stat", "--format=", entry.hash]));
        diff = redactText(raw, redactCfg);
      }

      const commitInfo: CommitInfo = {
        hash: entry.hash.slice(0, 8),
        date: entry.date,
        message: redactText(entry.message, redactCfg),
        author: entry.author_name,
        body: redactText(entry.body || "", redactCfg),
        filesChanged,
      };
      if (diff) commitInfo.diff = diff;
      if (filesChangedTruncated) {
        commitInfo.filesChangedTruncated = true;
        commitInfo.filesChangedCount = allFiles.length;
      }
      return commitInfo;
    })
  );

  const totalFilesChanged = new Set(commits.flatMap((c) => c.filesChanged)).size;

  const summary: GitSummary = {
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

export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfDaysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}
