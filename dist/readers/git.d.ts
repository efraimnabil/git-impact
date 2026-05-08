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
    dateRange: {
        from: string;
        to: string;
    };
}
export declare function readGitActivity(repoPath: string, since: Date, until?: Date): Promise<GitSummary>;
export declare function startOfDay(date?: Date): Date;
export declare function startOfDaysAgo(days: number): Date;
//# sourceMappingURL=git.d.ts.map