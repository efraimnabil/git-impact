import { GitSummary } from "../readers/git";
import { GitHubSummary } from "../readers/github";
import { UserContext } from "../storage/db";
export interface TranslateInput {
    git: GitSummary;
    github: GitHubSummary | null;
    context: UserContext | null;
    dateLabel: string;
}
export declare function buildPrompt(input: TranslateInput): string;
export declare function buildReviewPrompt(entries: Array<{
    date: string;
    items: Array<{
        status: string;
        summary: string;
        impact: string;
    }>;
    totalCommits: number;
    repoName: string;
}>, context: UserContext | null, periodLabel: string): string;
//# sourceMappingURL=prompt.d.ts.map