export interface UserContext {
    companyDescription: string;
    managerPriorities: string;
    glossary: Record<string, string>;
    githubToken?: string;
}
export type ImpactStatus = "done" | "in_progress" | "blocked";
export type ImpactProvenance = "pr" | "commit_body" | "commit_message" | "ticket" | "inferred";
export interface ImpactItem {
    status: ImpactStatus;
    summary: string;
    impact: string;
    technical_note?: string;
    /** Where the "why it matters" came from. "inferred" means the model guessed — surface this in UI. */
    provenance?: ImpactProvenance;
    /** Optional supporting refs (PR numbers, commit hashes, ticket IDs) for the bullet. */
    refs?: string[];
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
/**
 * Returns the most recent saved entry's date (YYYY-MM-DD), or null if none exists.
 * Used to power "since last standup" — the default mode after Phase 1.
 */
export declare function getLastEntryDate(repoRoot: string): string | null;
export declare function getEntriesForDaysAgo(days: number, repoRoot: string): ImpactEntry[];
//# sourceMappingURL=db.d.ts.map