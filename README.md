# git-impact

Translate your git commits into plain-English business impact — for standups, manager updates, and performance review prep.

```
📅 Thursday, May 8, 2026

✅ Shipped secure multi-tenant data access layer       [PR #142]
   → Prevents cross-company data leaks. Required for SOC2 compliance sign-off.

✅ Fixed login failures for admin users                [a1b2c3d, ENG-431]
   → Unblocks Q2 portal launch, was blocking 3 engineers.

⏳ In progress: Refactoring authentication flow        [inferred]
   → Will reduce login latency by ~40%, targeting end of week.

📁 6 files changed across auth + database layers
   4 commits on main
```

No API key, ever. Translation runs inside your AI editor.

---

## Install

Run this once inside any repo — no install step needed, `npx` fetches it on demand:

```bash
npx git-impact init
```

[![npm version](https://img.shields.io/npm/v/git-impact.svg)](https://www.npmjs.com/package/git-impact)

The wizard auto-detects which AI editors you already use and installs for them. Three short questions, then it self-installs:

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

  Which AI editors should I install for? (comma-separated, or "all")
  Options: claude, copilot, cursor, gemini, opencode
  (.agents/skills/ is always written — covers Goose, Amp, Codex, Letta, Roo)
  Detected in this repo: claude, cursor
  [press Enter to use detected]
  >
```

Then it creates everything and tells you what it did:

```
  ────────────────────────────────────
  git-impact installed

  ✅  .git-impact/context.json
  ✅  .gitignore
  ✅  .agents/skills/git-impact/SKILL.md          ← cross-vendor baseline
  ✅  .agents/skills/git-impact/references/...
  ✅  .claude/skills/git-impact/SKILL.md
  ✅  .claude/skills/git-impact/references/...
  ✅  .cursor/skills/git-impact/SKILL.md
  ✅  .cursor/skills/git-impact/references/...
  ✅  CLAUDE.md
  ✅  .git-impact/manifest.json

  Next steps:
  1. git add .git-impact/context.json && git commit -m "chore: add git-impact"
  2. In Claude Code: type "/git-impact" or say "do my standup"
  3. After a few standups: `git-impact view` to see the rolling dashboard
```

---

## Using it

Once installed, just talk to your AI editor naturally:

| What you say | What happens |
|---|---|
| `/git-impact` or `do my standup` | Translates commits since your last standup (survives weekends) |
| `since yesterday`, `since 3d`, `since 2026-05-01` | Explicit lookback window |
| `what did I ship this week?` | Looks back 7 days |
| `generate a performance review` | Synthesises history into review-prep evidence |
| `make a presentation for today` | Adds a bespoke shareable HTML page (opt-in) |
| `set up context for this repo` | Re-runs the init questions inline |

Works in any editor that supports the [Agent Skills](https://agentskills.io) format. Five editors get a vendor-specific mirror (**Claude Code**, **Cursor**, **GitHub Copilot** + VS Code, **Gemini CLI**, **OpenCode**). Every other Agent Skills adopter — **Goose**, **Amp**, **OpenAI Codex**, **Letta**, **Roo Code**, and future ones — picks up the same skill from the cross-vendor `.agents/skills/` baseline that's always written. One canonical `SKILL.md` folder, mirrored where each vendor's docs say it needs to live.

---

## How it works

git-impact ships two things: an [Agent Skills](https://agentskills.io)–compatible **skill** that handles the prompting (Claude Code, Cursor, Copilot, Gemini CLI, OpenCode get a vendor-specific mirror; Goose, Amp, Codex, Letta, Roo pick up the `.agents/skills/` baseline), and an **MCP server** that exposes typed data tools (git activity, history, context). The skill calls the MCP tools — no `sqlite3` shelling, no hand-rolled SQL.

```
your commits  →  MCP get_git_activity  →  privacy redaction  →  AI translation
                          ↓
              MCP save_impact_entry (with provenance + refs)
                          ↓
              .git-impact/result.html (rolling dashboard)
```

**Two safeguards built in:**

- **Privacy redaction** (default-on) — filenames matching `.env*`, `.aws/`, `.ssh/`, `*credentials*`, `*secret*`, `*.pem`, `*.key` get replaced with `[redacted-secret-file]` before they reach the model. Obvious-looking secret values in commit bodies (Stripe keys, AWS access key ids, GitHub PATs, Slack tokens, JWTs) become `[redacted-secret]`.
- **Per-bullet provenance** — every translated bullet is tagged `pr` / `commit_body` / `commit_message` / `ticket` / `inferred`. Inferred bullets surface with an amber chip in the HTML report so you (and your manager) can tell what's grounded vs. guessed.

History is saved locally to `.git-impact/history.db` (SQLite, gitignored) so review-prep can synthesise weeks or months of standups.

---

## What gets installed

```
your-project/
├── .agents/
│   └── skills/git-impact/                      # Cross-vendor Agent Skills baseline
│       ├── SKILL.md                            # Workflow router (orchestrates MCP tools)
│       └── references/                         # Loaded on demand (progressive disclosure)
│           ├── mode-standup.md
│           ├── mode-review.md
│           ├── mode-init.md
│           ├── translation-rules.md
│           └── html-template.md
├── .claude/skills/git-impact/                  # Same skill folder, mirrored for Claude Code
├── .cursor/skills/git-impact/                  # …mirrored for Cursor
├── .github/skills/git-impact/                  # …mirrored for GitHub Copilot + VS Code
├── .gemini/skills/git-impact/                  # …mirrored for Gemini CLI
├── .opencode/skills/git-impact/                # …mirrored for OpenCode
│   (Goose, Amp, Codex, Letta, Roo — read from .agents/skills/ above, no mirror)
├── .git-impact/
│   ├── context.json                            # Team glossary  ← commit this
│   ├── manifest.json                           # Install record ← commit this
│   ├── history.db                              # Local history  ← gitignored
│   ├── result.html                             # Rolling dashboard ← gitignored
│   └── standups/YYYY-MM-DD.html                # Bespoke presentations (opt-in)
└── CLAUDE.md                                   # Usage reminder block (managed)
```

**Commit the SKILL files and `context.json`. Everything else stays local.**

Re-running `npx git-impact init` is safe — it updates existing files in place.

---

## context.json

Lives at `.git-impact/context.json`. Commit it so everyone on the team gets the same translation:

```json
{
  "companyDescription": "B2B SaaS for workforce analytics",
  "managerPriorities": "Shipping on time, not breaking prod",
  "glossary": {
    "RLS": "data security layer",
    "MFA": "login security",
    "TabPFN": "AI predictions"
  },
  "privacy": {
    "redact": true,
    "filePatterns": ["*internal-only*"],
    "valuePatterns": ["MY_COMPANY_NAME"]
  }
}
```

The `privacy` block is optional — defaults work for most teams. Set `redact: false` to disable the filter, or extend the patterns to catch internal names / customer identifiers.

---

## Translation rules

The skill follows these rules to keep output useful rather than vague:

1. **What + why, not what + how** — "Fixed login failures for admin users → unblocks Q2 launch" not "updated auth middleware"
2. **Apply the glossary** — every term in `context.json` is replaced with its plain-English equivalent
3. **Provenance is mandatory** — every saved bullet is tagged `pr` / `commit_body` / `commit_message` / `ticket` / `inferred`. Inferred bullets render with an amber chip so the reader can spot what was grounded vs guessed.
4. **Group related commits** — four auth commits become one bullet, not four
5. **Three statuses** — `done` (✅), `in_progress` (⏳), `blocked` (🚫). WIP work surfaces the *expected* outcome, not the work-so-far.
6. **Use numbers** — "reduced latency by ~40%" beats "improved performance"

Full rules in [`skill/references/translation-rules.md`](skill/references/translation-rules.md).

---

## Performance review prep

Use the standup daily for a few weeks. History builds up in `history.db`. Then:

```
generate performance review prep for the last 90 days    ← Claude Code
generate review for Q2-2026                              ← any supported editor
```

Output (think of this as evidence pack you paste into your own writing — not a finished review):

```
Performance Review Prep — Q2 2026

Led the security layer redesign that enabled SOC2 compliance sign-off.

🚀 Security
   • Shipped multi-tenant data isolation, unblocking a $2M enterprise deal      [Apr 8, PR #98]
   • Resolved 2 auth vulnerabilities before the audit window                    [May 2, PR #114]

✅ Features
   • Delivered admin portal ahead of schedule (was blocking 3 engineers)        [Apr 22, PR #103]

🔧 Reliability
   • Reduced login latency by ~40% through auth flow refactor                   [May 8, inferred]

📊 47 commits across 58 working days
```

---

## CLI reference

The CLI is just for installing and viewing reports — translation always happens inside your AI editor.

```bash
git-impact init                    # set up / update this repo
git-impact view                    # open the HTML report of saved standups
git-impact view --date 2026-05-09  # open a specific day directly
```

All commands accept `-p <path>` to point at a different repo. By default the repo is auto-detected from the current directory.

---

## MCP server

The MCP server exposes git data as typed tools so AI editors can call them directly. No API key — your editor does the translation in its own session.

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

Available tools:

| Tool | What it does |
|---|---|
| `get_git_activity` | Reads commits + file changes, applies privacy redaction |
| `get_github_activity` | Pulls PR titles + descriptions (needs `github_token` in context) |
| `get_last_standup_date` | Powers the "since last standup" default |
| `save_impact_entry` | Persists a translation with provenance + refs |
| `get_history` | Returns saved entries for a date range |
| `render_dashboard` | Regenerates `.git-impact/result.html` and returns the file:// URL |
| `update_context` | Updates `context.json` (company / glossary / privacy / token) |

---

## Local development

```bash
git clone https://github.com/efraimnabil/git-impact
cd git-impact
npm install
npm run build

# Test the installer
node dist/cli/index.js init

# Open the HTML report
node dist/cli/index.js view

# Run the MCP server
node dist/mcp/server.js

# Tests
npm test                  # one-shot
npm run test:watch        # watch mode
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
│   ├── installer.ts        # install() + runInitWizard() + detectEditors()
│   ├── installer.test.ts
│   └── templates.ts        # CLAUDE.md block + context.json template
├── readers/
│   ├── git.ts              # reads git log, diffs, file changes
│   ├── github.ts           # reads PRs via GitHub API (optional)
│   ├── redact.ts           # privacy filter (filenames + secret-shaped values)
│   └── redact.test.ts
├── storage/
│   ├── db.ts               # per-repo SQLite history + context.json
│   └── db.test.ts
├── report/
│   ├── render.ts           # builds the rolling HTML dashboard
│   └── html.ts             # HTML template + provenance chips
├── mcp/
│   ├── server.ts           # MCP server entry point
│   ├── tools.ts            # typed data tools (get_git_activity, save_impact_entry, …)
│   ├── resources.ts        # MCP resources (context, history overview)
│   ├── prompts.ts          # computed prompt templates (standup, review)
│   └── repo.ts             # auto-detects repo root from cwd
└── cli/
    └── index.ts            # init + view commands
skill/
├── SKILL.md                # ~60-line router (picks a mode, points at references/)
└── references/             # loaded on demand (Agent Skills progressive disclosure)
    ├── mode-standup.md     # default mode — translate commits → bullets
    ├── mode-review.md      # synthesise history → performance review prep
    ├── mode-init.md        # interactive context.json setup
    ├── translation-rules.md
    └── html-template.md
```

---

## Roadmap

Shipped:
- [x] Skill + MCP architecture (skill orchestrates, tools provide)
- [x] Per-bullet provenance tags + refs
- [x] Privacy redaction (default-on)
- [x] "Since last standup" default
- [x] Editor auto-detection in init
- [x] Test baseline (Vitest, 40 tests)
- [x] Multi-editor: Claude Code, Copilot, Cursor, Gemini CLI
- [x] Canonical SKILL.md format ([Agent Skills](https://agentskills.io)) — vendor mirrors for OpenCode; `.agents/` baseline picked up by Goose, Amp, Codex, Letta, Roo
- [x] Auto-migration from pre-0.7 per-editor instruction files

Next:
- [ ] **PR description writer** — `git-impact-pr` skill produces ready-to-paste PR bodies
- [ ] **Multi-repo standup** — aggregate across `~/work/*` in one update
- [ ] **Changelog mode** — `since v1.2.0` produces user-facing release notes
- [ ] **Team / cloud features** — shared history, shareable evidence-pack URLs

---

MIT License
