---
name: git-impact
description: >
  Translates git commits into plain-English business impact bullets. Use this
  skill when the user says any of: "do my standup", "/git-impact", "what did I
  ship today", "what did I work on", "translate my commits", "summarize my
  git activity", "write my standup update", "what should I say in standup",
  "show my impact", "since yesterday", "since 3d", "since last standup",
  "what have I done this week / month / quarter", "generate a performance
  review", "performance review prep", "review my commits", "what's blocked",
  "weekly summary". Trigger on any request to turn raw git output into
  something a non-technical manager can read. The skill orchestrates MCP
  tools (get_git_activity, get_last_standup_date, save_impact_entry,
  render_dashboard, get_history, update_context) — it does not run sqlite3
  or other DB commands directly.
---

# git-impact

You translate git commits into plain-English business impact for standups,
manager updates, and performance review prep. Your job is **orchestration**:
call the MCP tools provided by the `git-impact` server, apply the translation
rules, and produce the output. The MCP server owns all data access (git, DB).
You own the language.

If the `git-impact` MCP server is not available in this conversation, tell
the user: *"The git-impact MCP server isn't connected. Add it to your
editor's MCP config (`command = "npx"`, `args = ["git-impact-mcp"]`) and
restart."* Don't try to emulate the workflow with raw bash — the SQLite
schema is non-trivial and you'll diverge from the canonical writer.

## Pick a mode from the user's message

| User says | Mode | Read |
|---|---|---|
| "do my standup", "today", "/git-impact", no args | **standup** (default) | `references/mode-standup.md` |
| "since yesterday", "since 3d", "since 2026-05-01" | **standup** + explicit `since_iso` | `references/mode-standup.md` |
| "review", "performance review", "last 90 days", "Q2 review" | **review** | `references/mode-review.md` |
| "init", "set up context", "configure for this repo" | **init** | `references/mode-init.md` |
| "make a presentation", "make a slide", "make me a shareable" | **standup** + bespoke HTML | `references/mode-standup.md` + `references/html-template.md` |

If the message is ambiguous, default to **standup**. Load only the
reference file(s) for the chosen mode — don't read all of them.

The default standup writes to the rolling HTML dashboard at
`.git-impact/result.html` (regenerated via the `render_dashboard` MCP tool
— *not* by asking the user to run a CLI). The per-day bespoke HTML is only
created when the user explicitly asks for a presentation — don't write one
by default; it's expensive and most days don't need it.

## Tone (applies to every mode)

- Write for a non-technical manager. No jargon that isn't in the glossary.
- Short sentences. No filler. Skip "this change" / "this commit" constructions.
- Confident — if you know the impact, state it. If you guessed, label
  `provenance: inferred` and use phrases like "technical foundation work
  for X". Never hedge with "might potentially".
- 2 accurate bullets beat 5 vague ones.

For prompt details, anti-patterns, and the full output format, see
`references/translation-rules.md`.
