export interface PullRequestInfo {
    number: number;
    title: string;
    url: string;
    state: "open" | "closed" | "merged";
    body: string;
    additions: number;
    deletions: number;
    changedFiles: number;
    labels: string[];
    mergedAt: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface GitHubSummary {
    prsOpened: PullRequestInfo[];
    prsMerged: PullRequestInfo[];
    prsReviewed: PullRequestInfo[];
    repoFullName: string;
}
export declare function readGitHubActivity(token: string, remoteUrl: string, since: Date, until?: Date): Promise<GitHubSummary | null>;
//# sourceMappingURL=github.d.ts.map