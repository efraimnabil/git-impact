"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPrompt = buildPrompt;
exports.buildReviewPrompt = buildReviewPrompt;
function buildPrompt(input) {
    const { git, github, context, dateLabel } = input;
    const contextBlock = context
        ? `
## Company & Role Context
${context.companyDescription ? `Company: ${context.companyDescription}` : ""}
${context.managerPriorities ? `Manager priorities: ${context.managerPriorities}` : ""}
${context.glossary && Object.keys(context.glossary).length > 0
            ? `Technical term translations:\n${Object.entries(context.glossary)
                .map(([term, meaning]) => `  - ${term} = ${meaning}`)
                .join("\n")}`
            : ""}
`.trim()
        : "";
    const commitsBlock = git.commits
        .map((c) => `- [${c.hash}] ${c.message}${c.body ? `\n  ${c.body.split("\n")[0]}` : ""}${c.filesChanged.length > 0
        ? `\n  Files: ${c.filesChanged.slice(0, 8).join(", ")}${c.filesChanged.length > 8 ? ` (+${c.filesChanged.length - 8} more)` : ""}`
        : ""}`)
        .join("\n");
    const githubBlock = github
        ? `
## GitHub Activity
Repo: ${github.repoFullName}

PRs Opened Today: ${github.prsOpened.length > 0 ? github.prsOpened.map((pr) => `#${pr.number} "${pr.title}"${pr.body ? ` — ${pr.body.slice(0, 100)}` : ""}`).join(", ") : "none"}

PRs Merged Today: ${github.prsMerged.length > 0 ? github.prsMerged.map((pr) => `#${pr.number} "${pr.title}"`).join(", ") : "none"}

PRs Reviewed Today: ${github.prsReviewed.length > 0 ? github.prsReviewed.map((pr) => `#${pr.number} "${pr.title}"`).join(", ") : "none"}
`.trim()
        : "";
    return `You are a technical writing assistant. Your job is to translate a developer's git activity into plain-English business impact for their daily standup or manager update.

${contextBlock}

## Git Activity for ${dateLabel}
Repo: ${git.repoName} (branch: ${git.branch})
Total files changed: ${git.totalFilesChanged}

Commits:
${commitsBlock || "No commits found"}

${githubBlock}

## Your Task
Translate the above technical work into 2–5 bullet points that a non-technical manager or stakeholder can understand.

Rules:
1. Each bullet must describe WHAT was accomplished and WHY it matters to the business. Never just restate the commit message.
2. Use the glossary to replace jargon (e.g. "RLS" → the meaning provided). If no glossary, infer plain English from context.
3. If you can't confidently infer business impact, say what was done technically but don't invent a business outcome — use phrasing like "technical foundation work".
4. For in-progress work (WIP commits, draft PRs), mark as "In progress" with expected outcome.
5. Group related commits into one bullet if they tell the same story.
6. Be specific — avoid vague phrases like "improved performance" without a number or context.
7. Keep each bullet to 1–2 sentences.

Respond with ONLY valid JSON matching this schema exactly:
{
  "items": [
    {
      "status": "done" | "in_progress",
      "summary": "Plain English summary of what was accomplished",
      "impact": "Why this matters — business value, who it unblocks, what risk it reduces. Omit if unknown.",
      "technical_note": "Optional: brief technical aside for a technical reader (1 phrase max)"
    }
  ],
  "files_summary": "Brief description of what areas of the codebase were touched (e.g. 'auth module + database layer')",
  "total_commits": ${git.commits.length},
  "total_files": ${git.totalFilesChanged}
}

If there are no commits and no GitHub activity, return:
{"items": [], "files_summary": "", "total_commits": 0, "total_files": 0}
`;
}
function buildReviewPrompt(entries, context, periodLabel) {
    const contextBlock = context?.companyDescription
        ? `Company: ${context.companyDescription}\nManager priorities: ${context.managerPriorities ?? "not specified"}`
        : "";
    const entriesBlock = entries
        .map((e) => `### ${e.date} (${e.repoName}, ${e.totalCommits} commits)\n${e.items.map((i) => `- [${i.status}] ${i.summary}. ${i.impact}`).join("\n")}`)
        .join("\n\n");
    return `You are writing a professional performance review summary for a software engineer.

${contextBlock}

## Work Log — ${periodLabel}

${entriesBlock}

## Your Task
Synthesize the above daily work logs into a structured performance review summary. Group by theme (e.g. "Features shipped", "Reliability & bugs", "Security", "Code review", "Infrastructure").

Respond with ONLY valid JSON:
{
  "period": "${periodLabel}",
  "themes": [
    {
      "name": "Theme name",
      "bullets": ["Specific achievement...", "..."],
      "impact_level": "high" | "medium" | "low"
    }
  ],
  "stats": {
    "total_commits": number,
    "working_days": number,
    "prs_reviewed": number
  },
  "headline": "One sentence that captures the engineer's biggest contribution this period"
}
`;
}
//# sourceMappingURL=prompt.js.map