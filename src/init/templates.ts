/**
 * Static, editor-agnostic templates used by the installer.
 *
 * The skill itself (SKILL.md + references/) is NOT embedded here — it's
 * copied directly from the shipped `skill/` directory at install time so
 * the SKILL.md, references/, and any future assets/ stay single-source.
 * See `installer.ts#installSkillFolder`.
 */

// ─── CLAUDE.md managed block ──────────────────────────────────────────────────

export const CLAUDE_MD_BLOCK = `
## git-impact

This repo uses [git-impact](https://github.com/efraimnafady/git-impact) for
standup and performance review generation. The skill works in any editor that
supports the [Agent Skills](https://agentskills.io) format — Claude Code,
Cursor, GitHub Copilot, Gemini CLI, OpenCode, and Antigravity get
vendor-specific mirrors; Goose, Amp, Codex, Letta, Roo pick up the same skill
from \`.agents/skills/\`.

- Say **"do my standup"** to translate today's commits into business impact
- Say **"git-impact since 3d"** to look back further
- Say **"generate a performance review"** after a few weeks of standups
- Say **"set up context for this repo"** to configure the glossary

Context is stored in \`.git-impact/context.json\` (committed, team-shared).
History is stored in \`.git-impact/history.db\` (gitignored, per-machine).
`;

// ─── context.json template ────────────────────────────────────────────────────

/**
 * Serialize the full UserContext to context.json. Pre-existing optional fields
 * (githubToken, privacy, …) flow through verbatim so a re-run of `init` never
 * drops state that wasn't collected by the wizard.
 */
export const CONTEXT_TEMPLATE = (ctx: object): string =>
  JSON.stringify(ctx, null, 2) + "\n";
