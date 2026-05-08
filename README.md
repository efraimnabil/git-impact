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

## Install

Run this once inside any repo — no install step needed, `npx` fetches it on demand:

```bash
npx git-impact init
```

[![npm version](https://img.shields.io/npm/v/git-impact.svg)](https://www.npmjs.com/package/git-impact)

The wizard asks four questions, then self-installs into the repo:

```
  git-impact init
  ────────────────────────────────────

  Repo: /your/project
  Files will be committed with your team.

  What does your company/product do? (1–2 sentences)
  > B2B SaaS for workforce analytics

  What does your manager care most about?
  > Shipping on time, not breaking prod

  Technical terms to translate? (optional)
  Format: "RLS=data security, MFA=login security"
  >

  Which AI tools do you use? (comma-separated, or "all")
  Options: claude, copilot, cursor, gemini
  [default: claude]
  > all
```

Then it creates everything and tells you what it did:

```
  ────────────────────────────────────
  git-impact installed

  ✅  .git-impact/context.json
  ✅  .gitignore
  ✅  .claude/skills/git-impact/SKILL.md
  ✅  .github/instructions/git-impact.instructions.md
  ✅  .cursor/rules/git-impact.mdc
  ✅  .gemini/commands/git-impact.md
  ✅  CLAUDE.md
  ✅  .git-impact/manifest.json

  Next steps:
  1. git add .git-impact/context.json .claude/ && git commit -m "chore: add git-impact"
  2. In Claude Code, say: "do my standup"
```

After that, open the project in Claude Code and you're ready to go.

---

## Using it

Once installed, just talk to your AI editor naturally:

| What you say | What happens |
|---|---|
| `do my standup` | Translates today's commits |
| `git-impact since 3d` | Looks back 3 days |
| `what did I ship this week?` | Looks back 7 days |
| `generate a performance review` | Synthesises the last 90 days |
| `set up context for this repo` | Re-runs the init questions inline |

Works in **Claude Code**, **GitHub Copilot**, **Cursor**, and **Gemini CLI** — each editor gets its own instruction file.

---

## How it works

git-impact reads your commits with `git log`, loads the team glossary from `.git-impact/context.json`, and translates them into business language. The AI editor does the translation inline — no separate process, no API key needed.

```
your commits  →  git log  →  context.json glossary  →  AI translation  →  standup
```

History is saved locally to `.git-impact/history.db` (SQLite, gitignored) so performance reviews can synthesise weeks or months of daily standups.

---

## What gets installed

```
your-project/
├── .claude/
│   └── skills/git-impact/
│       └── SKILL.md                          # Claude Code skill
├── .github/
│   └── instructions/
│       └── git-impact.instructions.md        # GitHub Copilot
├── .cursor/
│   └── rules/
│       └── git-impact.mdc                    # Cursor
├── .gemini/
│   └── commands/
│       └── git-impact.md                     # Gemini CLI
├── .git-impact/
│   ├── context.json                          # Team glossary  ← commit this
│   ├── manifest.json                         # Install record ← commit this
│   └── history.db                            # Local history  ← gitignored
└── CLAUDE.md                                 # Usage reminder block (managed)
```

**Commit everything except `history.db`.** Your teammates get the glossary and AI instructions automatically when they clone or pull.

Re-running `npx git-impact init` is safe — it updates existing files without creating duplicates.

---

## context.json

The glossary file lives at `.git-impact/context.json`. Commit it so everyone on the team gets the same translation:

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

You can edit it by hand or re-run `git-impact init` to update it through the wizard.

---

## Translation rules

The skill follows these rules to keep output useful rather than vague:

1. **What + why, not what + how** — "Fixed login failures for admin users → unblocks Q2 launch" not "updated auth middleware"
2. **Apply the glossary** — every term in `context.json` is replaced with its plain-English equivalent
3. **Never hallucinate** — if impact can't be inferred, says "technical foundation work for [area]"
4. **Group related commits** — four auth commits become one bullet, not four
5. **Flag WIP** — draft/WIP commits get `⏳ In progress:` with the expected outcome
6. **Use numbers** — "reduced latency by ~40%" beats "improved performance"

---

## Performance reviews

Use the standup daily for a few weeks. History builds up in `history.db`. Then:

```
generate a performance review for last 90 days    ← Claude Code
git-impact review --last 90                       ← CLI
git-impact review --quarter Q2-2026               ← CLI, specific quarter
```

Output:

```
Performance Review — Q2 2026

Led the security layer redesign that enabled SOC2 compliance sign-off.

🚀 Security
   • Shipped multi-tenant data isolation, unblocking a $2M enterprise deal
   • Resolved 2 auth vulnerabilities before the audit window

✅ Features
   • Delivered admin portal ahead of schedule (was blocking 3 engineers)

🔧 Reliability
   • Reduced login latency by ~40% through auth flow refactor

📊 47 commits across 58 working days
```

---

## CLI reference

The CLI requires an Anthropic API key (set during `init` or via `ANTHROPIC_API_KEY`). Not needed when using the Claude Code skill.

```bash
git-impact init                    # set up / update this repo
git-impact today                   # translate today's commits
git-impact since yesterday         # since yesterday
git-impact since 3d                # last 3 days
git-impact since 2026-05-01        # since a specific date
git-impact review --last 90        # performance review, last 90 days
git-impact review --quarter Q2-2026
```

All commands accept `-p <path>` to point at a different repo. By default the repo is auto-detected from the current directory.

---

## MCP server

The MCP server exposes git data as tools so Claude Code can call them directly. It requires no API key — Claude does the translation in its own session.

Add to `.claude/settings.json` in your project:

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

Available tools: `get_git_activity`, `get_github_activity`, `save_impact_entry`, `get_history`, `update_context`.

---

## Local development

```bash
git clone https://github.com/efraimnafady/git-impact
cd git-impact
npm install
npm run build

# Test the installer
node dist/cli/index.js init

# Test standup translation
node dist/cli/index.js today

# Run the MCP server
node dist/mcp/server.js
```

Publishing a new version:

```bash
npm version patch          # bump version
npm publish --otp=123456   # 6-digit code from your authenticator
git push --follow-tags
```

---

## Project structure

```
src/
├── init/
│   ├── installer.ts    # install() + runInitWizard() — the spec-kit style init
│   └── templates.ts    # all integration file content as embedded TS strings
├── readers/
│   ├── git.ts          # reads git log, diffs, file changes
│   └── github.ts       # reads PRs via GitHub API (optional)
├── translator/
│   ├── prompt.ts       # Claude prompt templates
│   └── translate.ts    # calls Claude API (CLI mode only)
├── storage/
│   └── db.ts           # per-repo SQLite history + context.json
├── mcp/
│   ├── server.ts       # MCP server entry point
│   ├── tools.ts        # data tools (get_git_activity, etc.)
│   ├── resources.ts    # MCP resources (context, history overview)
│   ├── prompts.ts      # computed prompt templates (standup, review)
│   └── repo.ts         # auto-detects repo root from cwd
└── cli/
    └── index.ts        # commander CLI
skill/
└── SKILL.md            # standalone Claude Code skill (copy to any repo)
```

---

## Roadmap

- [x] `npm publish` — `npx git-impact init` works zero-install
- [ ] Color output (`chalk`) in CLI mode
- [ ] `--copy` flag to put output on clipboard
- [ ] GitHub PR enrichment fully wired into standup output
- [ ] Web dashboard for shared performance review links

---

MIT License
