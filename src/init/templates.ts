/**
 * Editor-specific template content (Copilot, Cursor, Gemini).
 *
 * Note: the Claude Code skill is NOT embedded here — it's copied directly
 * from the shipped `skill/` directory at install time so SKILL.md and its
 * `references/` sub-files stay single-source. See `installer.ts`.
 */

// ─── CLAUDE.md managed block ──────────────────────────────────────────────────

export const CLAUDE_MD_BLOCK = `
## git-impact

This repo uses [git-impact](https://github.com/you/git-impact) for standup and
performance review generation.

- Say **"do my standup"** to translate today's commits into business impact
- Say **"git-impact since 3d"** to look back further
- Say **"generate a performance review"** after a few weeks of standups
- Say **"set up context for this repo"** to configure the glossary

Context is stored in \`.git-impact/context.json\` (committed, team-shared).
History is stored in \`.git-impact/history.db\` (gitignored, per-machine).
`;

// Shared instruction body used by Copilot, Cursor, Gemini.
// These editors don't auto-execute MCP tools the way Claude Code does, so
// the instructions here describe the bash fallback path. If the editor
// supports MCP, prefer the git-impact MCP server's tools over bash.
const SHARED_INSTRUCTIONS = `## When to trigger

User says any of: "do my standup", "/git-impact", "what did I ship today",
"translate my commits", "since yesterday", "since 3d", "since last standup",
"weekly summary", "performance review prep", "generate a review".

## Preferred path: MCP

If the \`git-impact\` MCP server is configured for this editor, use its tools:

1. \`get_last_standup_date\` — find the lookback start
2. \`get_git_activity\` (since_iso = day-after last standup, or start-of-today)
3. \`get_github_activity\` if a github_token exists in context
4. Translate using the rules below
5. \`save_impact_entry\` with each item including \`provenance\`
   (\`pr\` | \`commit_body\` | \`commit_message\` | \`ticket\` | \`inferred\`)

## Fallback path: bash

If MCP isn't available, run:
\`\`\`bash
REPO=$(git rev-parse --show-toplevel)
cat "$REPO/.git-impact/context.json"   # glossary, manager priorities
git -C "$REPO" log --since="today 00:00:00" --format="%h|%s|%b|%an|%ad" --date=short HEAD
git -C "$REPO" diff --stat HEAD~5 HEAD
\`\`\`

Then translate, then ask the user to run \`git-impact view\` to see the saved
HTML report (the bash path can't write to history.db safely from this editor).

## Translation rules

1. **What + why**, not what + how. Never restate commit messages.
2. **Apply the glossary** from context.json — replace technical terms with
   plain-English equivalents.
3. **Provenance is mandatory** for every saved item:
   - \`pr\` — quoted from the linked PR description
   - \`commit_body\` — pulled from a multi-line commit body
   - \`commit_message\` — visible in the subject line
   - \`ticket\` — pulled from a linked Linear/Jira ticket
   - \`inferred\` — guessed without explicit text. Use this honestly.
4. **Group related commits** into one bullet.
5. WIP → \`status: "in_progress"\` with **expected outcome**, not progress so far.
6. Blocked → \`status: "blocked"\`.
7. **Be specific with numbers** — pull them from commits/PRs, never invent them.

## Output

\`\`\`
📅 [Date or range]
✅ [Plain-English summary]
   → [Why it matters]
⏳ In progress: [What] → [Expected outcome]
🚫 Blocked: [What] → [What's needed]
📁 [N] files across [areas] · [N] commit(s) on [branch]
\`\`\`

## Tone

Non-technical-manager audience. Short sentences. No filler. 2 accurate bullets
beat 5 vague ones. If you guessed the impact, label \`provenance: inferred\`
and use phrasing like "technical foundation work for X" — never hedge with
"might potentially".
`;

// ─── GitHub Copilot instructions ──────────────────────────────────────────────

export const COPILOT_INSTRUCTIONS = `# git-impact

Translate git commits into plain-English business impact for standups,
manager updates, and performance review prep.

${SHARED_INSTRUCTIONS}`;

// ─── Cursor rules ─────────────────────────────────────────────────────────────

export const CURSOR_RULES = `---
description: git-impact — turn git commits into plain-English standup bullets
globs: []
alwaysApply: false
---

# git-impact

${SHARED_INSTRUCTIONS}`;

// ─── Gemini CLI commands ──────────────────────────────────────────────────────

export const GEMINI_COMMAND = `# git-impact

Translate git commits into plain-English business impact.

${SHARED_INSTRUCTIONS}`;

// ─── context.json template ────────────────────────────────────────────────────

export const CONTEXT_TEMPLATE = (
  companyDescription: string,
  managerPriorities: string,
  glossary: Record<string, string>
): string =>
  JSON.stringify(
    { companyDescription, managerPriorities, glossary },
    null,
    2
  ) + "\n";
