import { GitSummary } from "../readers/git";
import { GitHubSummary } from "../readers/github";
import { UserContext, ImpactItem } from "../storage/db";
export interface TranslationResult {
    items: ImpactItem[];
    filesSummary: string;
    totalCommits: number;
    totalFiles: number;
    rawJson: string;
}
export interface ReviewResult {
    period: string;
    themes: Array<{
        name: string;
        bullets: string[];
        impact_level: "high" | "medium" | "low";
    }>;
    stats: {
        total_commits: number;
        working_days: number;
        prs_reviewed: number;
    };
    headline: string;
}
export declare function translateActivity(git: GitSummary, github: GitHubSummary | null, context: UserContext | null, dateLabel: string): Promise<TranslationResult>;
export declare function generateReview(entries: Array<{
    date: string;
    items: Array<{
        status: string;
        summary: string;
        impact: string;
    }>;
    totalCommits: number;
    repoName: string;
}>, context: UserContext | null, periodLabel: string): Promise<ReviewResult>;
//# sourceMappingURL=translate.d.ts.map