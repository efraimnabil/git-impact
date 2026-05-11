import { RedactConfig } from "./redact";
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
    dateRange: {
        from: string;
        to: string;
    };
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
export declare function readGitActivity(repoPath: string, since: Date, until?: Date, redactCfg?: RedactConfig, options?: ReadGitOptions): Promise<GitSummary>;
export declare function startOfDay(date?: Date): Date;
export declare function startOfDaysAgo(days: number): Date;
//# sourceMappingURL=git.d.ts.map