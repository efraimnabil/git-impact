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

Save to history after printing. **The items_json shape matters** — the HTML
report and performance review reader expect this exact structure:

\`\`\`json
[
  {
    "status": "done",                      // "done" | "in_progress" | "blocked"
    "summary": "Plain-English what",       // REQUIRED — the bullet text
    "impact": "Why it matters",            // optional — what was unblocked
    "technical_note": "files/PR #refs"     // optional — small grey note
  }
]
\`\`\`

Use \`summary\` (not \`title\` or \`text\`) and always include \`status\`.

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

## Step 4 — Compose a real HTML presentation (REQUIRED)

After saving to history, **build a polished standalone HTML file using your
Write tool** — not a script, not a template. Each day's standup is bespoke.
The file should look like a manager-ready slide, not a bullet list with CSS.

### Where
- Write to: \`$REPO_ROOT/.git-impact/standups/YYYY-MM-DD.html\` (one file per day)
- Then update: \`$REPO_ROOT/.git-impact/standups/index.html\` — link to every daily file (newest first)

### Stack (all via CDN — no build step, no npm install)
- **Tailwind CSS**: \`<script src="https://cdn.tailwindcss.com"></script>\`
- **Inter font**: \`<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">\`
- **Lucide icons** (when icons would help): \`<script src="https://unpkg.com/lucide@latest"></script>\` then \`lucide.createIcons()\`
- **Chart.js** (only if there are real numbers to chart): \`<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\`
- **Mermaid** (for architecture/flow diagrams when relevant): \`<script type="module">import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.esm.min.mjs'; mermaid.initialize({startOnLoad:true, theme:'dark'});</script>\`

### Required structure

1. **Hero** — date, one bold headline that captures the day in plain English
   (not "9 commits" — something like "Shipped safety analytics, hardened tenant isolation")
2. **Stats grid** — 3-4 cards with the most meaningful numbers (commits, files, PRs merged, areas touched)
3. **Achievement cards** — one card per ✅ item:
   - Bold title with a status pill (✅ Shipped / ⏳ In Progress / 🚫 Blocked)
   - 1-2 sentence plain-English summary
   - "→ Why it matters" line in slightly muted text
   - Optional: relevant tags (PR #, area, file count)
4. **Visual element when warranted** — pick ONE if the content supports it:
   - Mermaid flow diagram if the day involved architecture/data-flow changes
   - Chart.js bar or donut if there are quantities worth comparing
   - Code-style block with a key formula or snippet (e.g. the LTIF formula)
   - Skip entirely if the day was straightforward — don't force visuals
5. **Footer** — file count, branch, commit count, link back to index

### Design language

- **Theme**: Dark mode by default, with \`prefers-color-scheme: light\` fallback
- **Background**: \`bg-slate-950\` (dark) / \`bg-white\` (light), with a subtle radial gradient highlight
- **Cards**: \`bg-slate-900/50 border border-slate-800 rounded-2xl p-6\` — generous padding, soft borders
- **Typography**: Inter, tight letter-spacing on headlines, 1.6 line-height on body
- **Color accents** by status:
  - Done → \`emerald-400 / emerald-500/20\` background pill
  - In progress → \`amber-400 / amber-500/20\`
  - Blocked → \`rose-400 / rose-500/20\`
- **Spacing**: \`max-w-4xl mx-auto px-8 py-12\`, generous \`space-y-6\` between cards
- **Print-friendly**: include a \`@media print\` block that hides the nav and uses light theme

### Example skeleton (adapt the content to today's actual work)

\`\`\`html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Standup — [Day, Date] · [Repo]</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', system-ui, sans-serif; }
    @media print { .no-print { display: none } body { background: white; color: black; } }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">
  <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_50%)] pointer-events-none"></div>

  <main class="relative max-w-4xl mx-auto px-8 py-16">
    <!-- Hero -->
    <header class="mb-16">
      <p class="text-sm uppercase tracking-widest text-slate-500 font-medium">[Saturday, May 9, 2026]</p>
      <h1 class="mt-3 text-5xl font-bold tracking-tight leading-tight">[Headline that captures the day]</h1>
      <p class="mt-4 text-xl text-slate-400 max-w-2xl">[One-sentence subtitle — why this day mattered]</p>
    </header>

    <!-- Stats -->
    <section class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
      <div class="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
        <div class="text-3xl font-bold">[N]</div>
        <div class="text-sm text-slate-400 mt-1">commits</div>
      </div>
      <!-- ... 3 more stat cards -->
    </section>

    <!-- Achievements -->
    <section class="space-y-4 mb-16">
      <h2 class="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-4">Shipped today</h2>
      <article class="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition">
        <div class="flex items-start gap-4">
          <span class="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-medium">✅ Shipped</span>
          <div class="flex-1">
            <h3 class="text-lg font-semibold">[Plain-English title]</h3>
            <p class="text-slate-300 mt-2 leading-relaxed">[One-sentence summary]</p>
            <p class="text-slate-400 mt-3 text-sm">→ [Why it matters in business terms]</p>
            <div class="flex gap-2 mt-4">
              <span class="text-xs text-slate-500">[area] · [PR #] · [N files]</span>
            </div>
          </div>
        </div>
      </article>
      <!-- ... more cards -->
    </section>

    <!-- Optional: visual section. Only include when warranted. -->
    <!-- Example with Mermaid: -->
    <!--
    <section class="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mb-16">
      <h2 class="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-4">Data flow</h2>
      <div class="mermaid">
        flowchart LR
          Upload[Plant CSV] --> Parser
          Parser --> RLS[Row-level security]
          RLS --> Causal[Causal analytics dashboard]
      </div>
    </section>
    <script type="module">
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.esm.min.mjs';
      mermaid.initialize({ startOnLoad: true, theme: 'dark', themeVariables: { fontFamily: 'Inter' } });
    </script>
    -->

    <!-- Footer -->
    <footer class="pt-8 border-t border-slate-800 text-sm text-slate-500 flex justify-between">
      <span>[N] files · [N] commits · [branch]</span>
      <a href="./index.html" class="hover:text-slate-300">← All standups</a>
    </footer>
  </main>
</body>
</html>
\`\`\`

### Then build the index page

\`$REPO_ROOT/.git-impact/standups/index.html\` should list every daily HTML file
in the \`standups/\` directory (newest first). When updating it, list every \`.html\`
file you find in that directory except \`index.html\` itself. Use the same dark
theme — a clean grid of cards, each linking to its day. Keep it lightweight.

### Then print the file URL on the last line

\`\`\`
🎯 file:///$REPO_ROOT/.git-impact/standups/$(date +%Y-%m-%d).html
\`\`\`

Replace \`$REPO_ROOT\` with the real absolute path so the user can ⌘-click it.

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
