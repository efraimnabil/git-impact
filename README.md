# git-impact

Translate your git commits into plain-English business impact — for standups, manager updates, and performance reviews.

```
📅 Thursday, May 8, 2026

✅ Shipped secure multi-tenant data access layer
   → Prevents cross-company data leaks. Required for SOC2 compliance sign-off.

✅ Fixed login failures for admin users
   → Unblocks Q2 portal launch, was blocking 3 engineers.

⏳ In progress: Refactoring authentication flow
   → Will reduce login latency by ~40%, targeting end of week.

📁 6 files changed across auth + database layers
   4 commits on main
```

No API key needed when used through Claude Code.

---

## How it works

You write commits. git-impact reads them with `git log`, loads your team's glossary from `.git-impact/context.json`, and translates them into business language. Claude does the translation — either inline (Claude Code skill/MCP, no API key) or via the CLI (needs an Anthropic API key).

---

## Two ways to use it

### Option A — Claude Code skill (recommended, no API key)

The skill turns "do my standup" into a slash command inside Claude Code. Claude reads your commits and translates them inline — no separate process, no API key.

**Install once globally:**

Copy `skill/SKILL.md` to your Claude Code skills directory:
```bash
mkdir -p ~/.claude/skills/git-impact
cp skill/SKILL.md ~/.claude/skills/git-impact/SKILL.md
```

**Or add per-repo** (so teammates get it too):
```bash
mkdir -p your-project/.claude/skills/git-impact
cp skill/SKILL.md your-project/.claude/skills/git-impact/SKILL.md
git add .claude/ && git commit -m "chore: add git-impact skill"
```

**Use it:**
```
do my standup
what did I ship this week?
git-impact since 3d
generate a performance review for last 90 days
set up context for this repo
```

---

### Option B — MCP server (no API key, works conversationally in Claude Code)

The MCP server exposes data tools + computed prompt templates. Claude Code calls them and does the translation in its own session.

**Add to your repo** (teammates get it on clone):
```bash
mkdir -p your-project/.claude
```

Add `.claude/settings.json`:
```json
{
  "mcpServers": {
    "git-impact": {
      "command": "npx",
      "args": ["git-impact-mcp"]
    }
  }
}
```

> Until published to npm, use the local path:
> `"args": ["/path/to/git-impact/dist/mcp/server.js"]`

Then in Claude Code say: `do my standup`, `generate a review for Q2`, `set up context for this repo`.

---

### Option C — CLI with API key

Standalone terminal command. Needs an Anthropic API key.

```bash
npm install -g git-impact
git-impact init          # one-time setup
git-impact today         # translate today's commits
git-impact since 3d      # look back 3 days
git-impact review --last 90   # performance review
```

---

## Per-repo setup (all modes)

Run once per project to save your team's context:

```
set up context for this repo     ← in Claude Code (skill or MCP)
git-impact init                  ← in the CLI
```

This creates `.git-impact/context.json`:

```json
{
  "companyDescription": "B2B SaaS for workforce analytics",
  "managerPriorities": "Shipping on time, not breaking prod",
  "glossary": {
    "RLS": "data security layer",
    "MFA": "login security",
    "TabPFN": "AI predictions"
  }
}
```

**Commit `context.json` to share it with your team.** Everyone who opens the project in Claude Code gets the same glossary automatically.

```bash
git add .git-impact/context.json
git commit -m "chore: add git-impact context"
```

The history file (`.git-impact/history.db`) is automatically added to `.gitignore` — it's private per machine.

---

## What gets created in your repo

```
your-project/
├── .claude/
│   ├── settings.json          # MCP config  — commit this
│   └── skills/git-impact/
│       └── SKILL.md           # Skill       — commit this
├── .git-impact/
│   ├── context.json           # Glossary    — commit this
│   └── history.db             # History     — gitignored (private)
```

---

## Translation rules

The skill and MCP server follow these rules to make output actually useful:

1. **What + why, not what + how** — "Fixed login failures for admin users → unblocks Q2 launch" not "updated middleware"
2. **Apply the glossary** — replaces every term in `context.json` automatically
3. **Never hallucinate** — if impact can't be inferred, says "technical foundation work for X"
4. **Group related commits** — 4 auth commits become one bullet, not four
5. **Flag WIP** — draft/WIP commits get `⏳ In progress:` with expected outcome

---

## Performance reviews

After using the standup daily for a few weeks, history accumulates in `.git-impact/history.db`. Then:

```
generate a performance review for last 90 days    ← Claude Code
git-impact review --quarter Q2-2026               ← CLI
```

Output:
```
Performance Review — Q2 2026

Led the security layer redesign that enabled SOC2 compliance sign-off.

🚀 Security
   • Shipped multi-tenant data isolation, blocking $2M enterprise deal requirement
   • Resolved 2 auth vulnerabilities before audit window

✅ Features
   • Delivered admin portal ahead of schedule (was blocking 3 engineers)
   ...

📊 47 commits across 58 working days
```

---

## Local development

```bash
git clone https://github.com/you/git-impact
cd git-impact
npm install
npm run build

# Try the CLI
node dist/cli/index.js init
node dist/cli/index.js today

# Run the MCP server
node dist/mcp/server.js
```

---

## Project structure

```
src/
├── readers/
│   ├── git.ts          # reads git log, diffs, file changes
│   └── github.ts       # reads PRs via GitHub API (optional)
├── translator/
│   ├── prompt.ts       # Claude prompt templates
│   └── translate.ts    # calls Claude API (CLI mode only)
├── storage/
│   └── db.ts           # per-repo SQLite + context.json
├── mcp/
│   ├── server.ts       # MCP server entry point
│   ├── tools.ts        # data tools (get_git_activity, etc.)
│   ├── resources.ts    # MCP resources (context, history overview)
│   ├── prompts.ts      # computed prompt templates (standup, review)
│   └── repo.ts         # auto-detects repo root from cwd
├── cli/
│   └── index.ts        # commander CLI
skill/
└── SKILL.md            # Claude Code skill (no API key needed)
```

---

## Roadmap

- [ ] Color output (`chalk`) in CLI mode
- [ ] `--copy` flag to put output on clipboard
- [ ] GitHub PR enrichment fully wired into standup
- [ ] `npm publish` — `npx git-impact-mcp` for zero-install MCP
- [ ] Web dashboard for shared performance review links (Phase 4)

---

MIT License
