/**
 * All template content is embedded here as strings.
 * This means the package works correctly after `npm install -g`
 * without needing to locate template files on disk.
 */

// ─── Claude Code skill ────────────────────────────────────────────────────────

export const CLAUDE_SKILL = `---
name: git-impact
description: >
  Translates git commits into plain-English business impact — for standups,
  manager updates, and performance reviews. Use this skill whenever the user
  says: "do my standup", "translate my commits", "what did I ship today/this
  week", "write my standup", "show my impact", "git-impact", "/git-impact",
  "generate a performance review", "what have I done this quarter", or any
  request to turn technical git output into something a non-technical manager
  can understand.
---

# git-impact

Translate git commits into plain-English business impact without an API key.
Read git data with bash, load the repo's context file, and write the translation
inline.

## Sub-commands

| User says | Mode |
|---|---|
| \`do my standup\`, \`today\`, no args | **today** |
| \`since yesterday\`, \`since 3d\`, \`since 2026-05-01\` | **since \\<when\\>** |
| \`review\`, \`last 30 days\`, \`Q2 review\` | **review** |
| \`init\`, \`set up context\` | **init** |

## Step 1 — Find the repo root

\`\`\`bash
git rev-parse --show-toplevel 2>/dev/null
\`\`\`

If it fails: *"No git repository found. Open a project folder first."* Stop.

## Step 2 — Load context

\`\`\`bash
cat "$REPO_ROOT/.git-impact/context.json" 2>/dev/null || echo "NONE"
\`\`\`

Apply the glossary (technical term → plain English) and frame impact around
manager priorities. If no context file exists, use general language and
suggest running init.

## Mode: today / since \\<when\\>

Fetch commits:
\`\`\`bash
# today
git -C "$REPO_ROOT" log \\
  --since="$(date '+%Y-%m-%d') 00:00:00" \\
  --format="%h|%s|%b|%an|%ad" --date=short HEAD

# since Nd  →  --since="N days ago 00:00:00"
# since YYYY-MM-DD  →  --since="YYYY-MM-DD 00:00:00"
\`\`\`

Fetch files changed:
\`\`\`bash
FIRST=$(git -C "$REPO_ROOT" log --since="..." --format="%h" HEAD | tail -1)
git -C "$REPO_ROOT" diff --stat "$FIRST"^ HEAD 2>/dev/null
\`\`\`

**Translation rules:**
1. Each bullet = what was done + WHY it matters to the business. Never restate the commit message.
2. Apply glossary — replace every technical term listed in context.json.
3. If impact can't be inferred → "technical foundation work for [area]". Never hallucinate.
4. Group related commits — 4 auth commits = 1 bullet.
5. WIP commits → "⏳ In progress: [what] → [expected outcome]"
6. Be specific — use numbers from commit messages when they exist.

**Output:**
\`\`\`
📅 [Day, Date]

✅ [Plain-English summary]
   → [Business impact — who it unblocks, what risk it reduces]

⏳ In progress: [what]
   → [Expected outcome]

📁 [N] files changed across [areas]
   [N] commit(s) on [branch]
\`\`\`

Save to history after printing:
\`\`\`bash
mkdir -p "$REPO_ROOT/.git-impact"
sqlite3 "$REPO_ROOT/.git-impact/history.db" "
  CREATE TABLE IF NOT EXISTS impact_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL, repo_name TEXT NOT NULL,
    total_commits INTEGER NOT NULL DEFAULT 0,
    total_files INTEGER NOT NULL DEFAULT 0,
    items_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO impact_entries (date, repo_name, total_commits, total_files, items_json)
  VALUES ('$(date +%Y-%m-%d)', '$(basename $REPO_ROOT)', $COMMITS, $FILES, '$JSON');
" 2>/dev/null || true
\`\`\`

## Mode: review

Query history and synthesise a performance review:
\`\`\`bash
sqlite3 "$REPO_ROOT/.git-impact/history.db" \\
  "SELECT date, repo_name, total_commits, items_json
   FROM impact_entries WHERE date >= '$FROM' AND date <= '$TO'
   ORDER BY date ASC;" 2>/dev/null
\`\`\`

If no history: *"No saved history yet. Run the standup daily for a few weeks first."*

Format:
\`\`\`
Performance Review — [Period]
[Headline sentence — biggest contribution]

🚀 [High-impact theme]
   • Specific achievement with numbers...

✅ [Medium theme] ...
🔧 [Lower theme] ...

📊 [N] commits across [N] working days
\`\`\`

## Mode: init

Ask one at a time:
1. "What does your company/product do? (1–2 sentences)"
2. "What does your manager care most about?"
3. "Technical terms to translate? e.g. RLS=data security (blank to skip)"

Write \`.git-impact/context.json\` and confirm:
*"Saved. Commit context.json to share the glossary with your team."*

## Tone

Non-technical manager audience. Short sentences. No filler. Confident — if
you know the impact, state it. 2 accurate bullets > 5 vague ones.
`;

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

// ─── GitHub Copilot instructions ──────────────────────────────────────────────

export const COPILOT_INSTRUCTIONS = `# git-impact

Translate git commits into plain-English standup bullets when the user asks
to "do my standup", "translate my commits", "what did I ship today", or
"generate a performance review".

## How to translate commits

1. Run \`git log --since="today 00:00:00" --format="%h|%s|%b" HEAD\` to get commits
2. Read \`.git-impact/context.json\` for glossary and company context
3. Translate into 2–5 bullets following these rules:
   - What was done + WHY it matters (never restate commit messages)
   - Apply glossary terms from context.json
   - Group related commits into one bullet
   - WIP commits → "⏳ In progress: [what] → [expected outcome]"
   - If impact can't be inferred → "technical foundation work for [area]"

## Output format

\`\`\`
📅 [Date]
✅ [Summary] → [Business impact]
⏳ In progress: [What] → [Expected outcome]
📁 [N] files changed across [areas]
\`\`\`

For performance reviews, query \`.git-impact/history.db\` and group by theme.
`;

// ─── Cursor rules ─────────────────────────────────────────────────────────────

export const CURSOR_RULES = `---
description: git-impact standup and performance review generation
globs: []
alwaysApply: false
---

# git-impact

When the user asks to "do my standup", "translate commits", "what did I ship",
or "generate a performance review":

1. Find repo root: \`git rev-parse --show-toplevel\`
2. Load context: \`cat .git-impact/context.json\`
3. Fetch commits: \`git log --since="today 00:00:00" --format="%h|%s|%b" HEAD\`
4. Translate into 2–5 plain-English bullets:
   - Apply glossary from context.json
   - Each bullet = what + why it matters (never restate commit messages)
   - Group related commits, flag WIP with ⏳
5. Format: ✅ [summary] → [business impact]
6. Save to \`.git-impact/history.db\` via sqlite3

For reviews: query history.db and group by theme (Features, Security, Reliability, etc.)
`;

// ─── Gemini CLI commands ──────────────────────────────────────────────────────

export const GEMINI_COMMAND = `# git-impact

Translate git commits into plain-English standup bullets.

## When to use

User says: "do my standup", "translate my commits", "what did I ship today/this week",
"generate a performance review", or "git-impact".

## Steps

1. \`git rev-parse --show-toplevel\` → get repo root
2. \`cat .git-impact/context.json\` → load glossary and company context
3. \`git log --since="today 00:00:00" --format="%h|%s|%b" HEAD\` → get commits
4. Translate into 2–5 bullets:
   - Apply glossary (replace technical terms with plain-English equivalents)
   - What was done + why it matters to the business
   - Group related commits
   - WIP commits: ⏳ In progress: [what] → [expected outcome]
5. End with: 📁 [N] files changed across [areas]
6. Save to .git-impact/history.db

## Context file format (.git-impact/context.json)

\`\`\`json
{
  "companyDescription": "...",
  "managerPriorities": "...",
  "glossary": { "TERM": "plain English meaning" }
}
\`\`\`
`;

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
