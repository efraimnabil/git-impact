export interface UserContext {
    companyDescription: string;
    managerPriorities: string;
    glossary: Record<string, string>;
    githubToken?: string;
    anthropicApiKey?: string;
}
export interface ImpactItem {
    status: "done" | "in_progress";
    summary: string;
    impact: string;
    technical_note?: string;
}
export interface ImpactEntry {
    id?: number;
    date: string;
    repoPath: string;
    repoName: string;
    totalCommits: number;
    totalFiles: number;
    filesSummary: string;
    items: ImpactItem[];
    rawJson: string;
    createdAt: string;
}
export declare function loadContext(repoRoot: string): UserContext | null;
export declare function saveContext(ctx: UserContext, repoRoot: string): void;
export declare function saveEntry(entry: ImpactEntry, repoRoot: string): number;
export declare function getEntriesForRange(fromDate: string, toDate: string, repoRoot: string): ImpactEntry[];
export declare function getEntriesForDaysAgo(days: number, repoRoot: string): ImpactEntry[];
//# sourceMappingURL=db.d.ts.map