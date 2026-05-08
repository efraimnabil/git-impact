---
name: git-impact
description: >
  Translates git commits into plain-English business impact bullets — ideal for
  daily standups, manager updates, and end-of-quarter performance reviews.
  Use this skill whenever the user says anything like: "do my standup",
  "what did I work on today", "translate my commits", "summarize my git activity",
  "write my standup update", "what should I say in standup", "git-impact",
  "/git-impact", "show my impact", "translate today's work", "what did I ship",
  "generate a performance review", "what have I done this week/month/quarter",
  "review my commits". Also trigger for "since yesterday", "last 3 days commits",
  or any request to turn technical git output into something a manager can read.
---

# git-impact

Translate git commits into plain-English business impact for standups, manager
updates, and performance reviews — without an API key. You do the translation
inline using bash to read git data and a per-repo context file for personalization.

---

## Sub-commands

Parse the user's message to determine which mode to run:

| What the user says | Mode |
|---|---|
| `do my standup`, `today`, `/git-impact`, no args | **today** |
| `since yesterday`, `since 3d`, `since 2026-05-01` | **since \<when\>** |
| `review`, `performance review`, `last 30 days`, `Q2 review` | **review** |
| `init`, `set up context`, `configure for this repo` | **init** |

---

## Step 1 — Find the repo root

Run this to find the git root from wherever you are:

```bash
git rev-parse --show-toplevel 2>/dev/null
```

If it fails, tell the user: *"No git repository found in the current directory. Open
a project folder first, or `cd` into a repo."* Stop there.

Store the result as `REPO_ROOT`.

---

## Step 2 — Load context (if it exists)

```bash
cat "$REPO_ROOT/.git-impact/context.json" 2>/dev/null || echo "NONE"
```

If the file exists, parse it. It looks like:

```json
{
  "companyDescription": "B2B SaaS for workforce analytics",
  "managerPriorities": "Shipping on time, not breaking prod",
  "glossary": {
    "RLS": "data security layer",
    "TabPFN": "AI predictions",
    "MFA": "login security"
  }
}
```

Use this to personalise your translation — apply the glossary and frame impact
around what the manager cares about. If the file doesn't exist, use general
technical language and suggest running `init` at the end.

---

## Mode: today / since \<when\>

### Fetch commits

For **today**:
```bash
git -C "$REPO_ROOT" log \
  --since="$(date '+%Y-%m-%d') 00:00:00" \
  --format="%h|%s|%b|%an|%ad" \
  --date=short \
  HEAD
```

For **since \<when\>** — convert the user's input to a git `--since` value:
- `yesterday` → `--since="yesterday 00:00:00"`
- `3d` → `--since="3 days ago 00:00:00"`
- `2026-05-01` → `--since="2026-05-01 00:00:00"`

### Fetch files changed

```bash
FIRST=$(git -C "$REPO_ROOT" log --since="..." --format="%h" HEAD | tail -1)
git -C "$REPO_ROOT" diff --stat "$FIRST"^ HEAD 2>/dev/null || \
  git -C "$REPO_ROOT" show --stat "$FIRST" 2>/dev/null
```

### Translate

If there are no commits, say so clearly and stop.

Otherwise translate into **2–5 bullet points**. Follow these rules:

1. **What + why, not what + how.** Each bullet must say what was accomplished
   AND why it matters to the business. "Fixed a bug in the auth middleware" is
   useless to a manager. "Fixed login failures for admin users — unblocks the
   Q2 portal launch" is useful.

2. **Apply the glossary.** Replace every technical term listed in context.json
   with its plain-English equivalent. If no glossary, infer from context.

3. **Never hallucinate impact.** If you can't infer the business reason, say
   "technical foundation work for [area]" rather than inventing an outcome.

4. **Group related commits.** Three commits all touching auth tell one story —
   write one bullet, not three.

5. **WIP / draft commits** get `⏳ In progress:` and state what the expected
   outcome is, not what was done so far.

6. **Be specific.** "Improved performance" is vague. "Reduced login latency
   by ~40%" is specific. Use whatever numbers exist in the commit messages.

### Output format

```
📅 [Day, Date]

✅ [Plain-English summary of what was accomplished]
   → [Why it matters — who it unblocks, what risk it reduces, what it enables]

⏳ In progress: [What is being worked on]
   → [Expected outcome when complete]

📁 [N] files changed across [brief description of areas touched]
   [N] commit(s) on [branch name]
```

### Save to history

After printing the output, silently save to `.git-impact/history.db`:

```bash
mkdir -p "$REPO_ROOT/.git-impact"
grep -qxF '.git-impact/history.db' "$REPO_ROOT/.gitignore" 2>/dev/null || \
  printf '\n# git-impact local history (private, per-machine)\n.git-impact/history.db\n' \
  >> "$REPO_ROOT/.gitignore"

sqlite3 "$REPO_ROOT/.git-impact/history.db" "
CREATE TABLE IF NOT EXISTS impact_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT NOT NULL,
  repo_name     TEXT NOT NULL,
  total_commits INTEGER NOT NULL DEFAULT 0,
  total_files   INTEGER NOT NULL DEFAULT 0,
  items_json    TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO impact_entries (date, repo_name, total_commits, total_files, items_json)
VALUES ('$(date +%Y-%m-%d)', '$(basename $REPO_ROOT)', $COMMIT_COUNT, $FILE_COUNT, '$ITEMS_JSON');
"
```

If `sqlite3` is not available, skip silently.

---

## Mode: review

Fetch saved history and synthesise a performance review.

Parse the period from the user's message:
- `last 30 days` / `30d` → last 30 days
- `last 90 days` / `90d` → last 90 days (default)
- `Q2-2026` → April 1 – June 30, 2026

```bash
sqlite3 "$REPO_ROOT/.git-impact/history.db" \
  "SELECT date, repo_name, total_commits, items_json
   FROM impact_entries
   WHERE date >= '$FROM' AND date <= '$TO'
   ORDER BY date ASC;" 2>/dev/null
```

If the DB doesn't exist or returns nothing: *"No saved history found for this
period. Use the standup mode daily to build up history, then come back."*

Otherwise synthesise:

```
Performance Review — [Period]

[One headline sentence — biggest contribution this period]

🚀 [High-impact theme]
   • Specific achievement...

✅ [Medium-impact theme]
   • Specific achievement...

🔧 [Lower-impact theme]
   • ...

---
📊 [N] commits across [N] working days
```

Group by theme (Features shipped, Reliability, Security, Code review,
Infrastructure). Only include themes that apply.

---

## Mode: init

Ask the user three questions one at a time:

1. *"What does your company/product do? (1–2 sentences)"*
2. *"What does your manager care most about?"*
3. *"Any technical terms to translate? Format: RLS=data security, MFA=login security (leave blank to skip)"*

Then write `.git-impact/context.json` and tell the user:
*"Saved to `.git-impact/context.json`. Commit this to share the glossary with
your team. history.db is gitignored automatically."*

---

## Tone

- Write for a non-technical manager. No jargon that isn't in the glossary.
- Short sentences. No filler. Skip "this change" / "this commit" constructions.
- Confident — if you know the impact, state it. If not, use
  "technical foundation work for X", never hedge with "might potentially".
- 2 accurate bullets beat 5 vague ones.
