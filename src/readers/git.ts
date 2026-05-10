import simpleGit, { DefaultLogFields, LogResult } from "simple-git";
import * as path from "path";
import { redactFilename, redactText, RedactConfig } from "./redact";

export interface CommitInfo {
  hash: string;
  date: string;
  message: string;
  author: string;
  body: string;
  diff: string;
  filesChanged: string[];
}

export interface GitSummary {
  commits: CommitInfo[];
  totalFilesChanged: number;
  repoName: string;
  branch: string;
  dateRange: { from: string; to: string };
}

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
  redactCfg: RedactConfig = { enabled: true }
): Promise<GitSummary> {
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

  const commits: CommitInfo[] = await Promise.all(
    log.all.map(async (entry) => {
      // Root commits don't have a parent; `<hash>^` blows up. Fall back to
      // `git show --stat` which works for both root and non-root commits.
      const diff = await git
        .diff([`${entry.hash}^`, entry.hash, "--stat"])
        .catch(() => git.show(["--stat", "--format=", entry.hash]));
      const showOutput = await git.show([
        "--stat",
        "--name-only",
        "--format=",
        entry.hash,
      ]);
      const filesChanged = showOutput
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.includes("|") && !l.startsWith("=>") && !l.match(/^\d+ file/))
        .map((f) => redactFilename(f, redactCfg));

      return {
        hash: entry.hash.slice(0, 8),
        date: entry.date,
        message: redactText(entry.message, redactCfg),
        author: entry.author_name,
        body: redactText(entry.body || "", redactCfg),
        diff: redactText(diff, redactCfg),
        filesChanged,
      };
    })
  );

  const allFiles = new Set(commits.flatMap((c) => c.filesChanged));

  return {
    commits,
    totalFilesChanged: allFiles.size,
    repoName,
    branch: branch.trim(),
    dateRange: {
      from: sinceStr,
      to: untilStr,
    },
  };
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
