# Mode: standup

The default mode. Translates commits since the user's last standup into
2–5 plain-English bullets, prints them, saves to history, regenerates the
rolling HTML dashboard.

## 0. Resolve the repo path FIRST (before any MCP call)

The MCP server's cwd is not your editor's cwd — it usually lives inside
the npx cache. Every tool call needs an explicit `repo_path`. Get it once
at the top of the standup:

```bash
pwd   # returns the absolute path of the open project
```

Save that as `REPO_PATH` and pass it as `repo_path` to every MCP tool call
in this standup. If the user's message names a specific project ("for
~/code/foo"), use that instead.

## 1. Resolve the lookback window

- If the user said an explicit "since X", convert to an ISO timestamp and use it.
- Otherwise call **`get_last_standup_date`**. If it returns a date, use the
  start of the day after that date as `since_iso`. If it returns null,
  default to start-of-today.

This is the "since last standup" default — it survives weekends and days off.

## 2. Fetch git activity

Call **`get_git_activity`** with `since_iso` and (optionally) `until_iso`.
You'll get back commits, file stats, branch, and `_repo_root` — the
absolute path the MCP server resolved.

> **CRITICAL: capture `_repo_root` from this response and pass it as
> `repo_path` to every subsequent tool call** (`save_impact_entry`,
> `render_dashboard`, `get_history`). The MCP server caches it after
> the first successful call, but threading it explicitly is the safe
> belt-and-suspenders move and removes any chance the second tool call
> resolves to a different directory.

If there are no commits in the window: tell the user clearly and stop. Do
NOT save an empty entry.

## 3. Optional: enrich with GitHub PR data

If the user has a `github_token` saved in their context (the
`get_git_activity` response or a prior `get_github_activity` call will tell
you), call **`get_github_activity`** to pull PR titles and descriptions.
PR descriptions are the single best source for accurate "why it matters"
text — strongly prefer them over inference.

## 4. Translate

Read **`references/translation-rules.md`** for the prompt-engineering details.
Key rules at a glance:

- **What + why**, not what + how
- **Apply the glossary** from `context.json` (returned by the context resource
  or visible in `get_git_activity` output)
- **Provenance is mandatory** — every saved bullet gets `pr` / `commit_body` /
  `commit_message` / `ticket` / `inferred`
- **Group related commits** into one bullet, not many
- **2-5 bullets total**, never more

## 5. Print the user-facing output

```
📅 [Day, Date or date range]

✅ [Summary]
   → [Why it matters]

⏳ In progress: [What]
   → [Expected outcome]

🚫 Blocked: [What]   (only if applicable)
   → [What's needed]

📁 [N] files across [areas]
   [N] commit(s) on [branch]
```

## 6. Save to history

Call **`save_impact_entry`** with the structured items including
`provenance` for each. The MCP tool handles the SQLite write — never run
`sqlite3` directly. Required fields per item: `status`, `summary`,
`provenance`. Recommended: `impact`, `refs`.

Example item:
```json
{
  "status": "done",
  "summary": "Shipped multi-tenant data isolation",
  "impact": "Unblocks SOC2 sign-off, prevents cross-company data leaks",
  "provenance": "pr",
  "refs": ["PR #142", "ENG-1234"]
}
```

## 7. Regenerate the rolling dashboard, then print its URL

Call **`render_dashboard`** with the same `repo_path`. It rewrites
`.git-impact/result.html` so today's entry is included, and returns
the `file://` URL.

End your reply with that URL on its own last line so the user can
⌘-click to open:

```
🎯 file:///<absolute-repo-path>/.git-impact/result.html
```

Don't try to open a browser yourself — printing the URL is enough.

**Only if the user explicitly asked for a "presentation", "slide",
"shareable", or "screenshot-friendly" output**, ALSO read
`references/html-template.md` and use your `Write` tool to create
`<repo>/.git-impact/standups/YYYY-MM-DD.html` (plus update
`standups/index.html`). Most days don't need this — skip by default.
