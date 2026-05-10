# Translation rules

Read this file when translating commits into impact bullets. The main `SKILL.md`
covers orchestration; this file owns the prompt-engineering details.

## Core rules

1. **What + why, not what + how.** Each bullet must say what was accomplished
   AND why it matters. "Fixed a bug in the auth middleware" is useless to a
   manager. "Fixed login failures for admin users — unblocks the Q2 portal
   launch" is useful.

2. **Apply the glossary.** Replace every term in `context.json`'s `glossary`
   with its plain-English equivalent. If no glossary exists, infer from
   context but stay non-jargon.

3. **Provenance is mandatory.** Every bullet you save via `save_impact_entry`
   MUST include a `provenance` value. Use the strongest source available:

   | Provenance | When to use |
   |---|---|
   | `pr` | The "why" came from the linked PR description body |
   | `commit_body` | The "why" came from a multi-line commit message body (after the subject) |
   | `commit_message` | The "why" was visible in the commit subject line itself |
   | `ticket` | The "why" came from a linked Linear/Jira/GitHub issue |
   | `inferred` | You guessed the impact without explicit text supporting it |

   **Never label something `pr` or `commit_body` if you actually inferred it.**
   Inferred is honest; faking provenance is worse than admitting a guess.

4. **Group related commits.** Three commits all touching auth tell one story.
   Write one bullet, not three. The grouping should follow the user's
   *narrative*, not just shared paths — two commits in `/auth/` may be unrelated.

5. **WIP / draft commits** get `status: "in_progress"` and the bullet should
   describe the **expected outcome** when complete, not what was done so far.
   "Refactoring auth flow → will reduce login latency by ~40%" beats
   "WIP: extracted middleware function".

6. **Blocked work** gets `status: "blocked"`. Use this when a commit is
   reverted, a branch is abandoned, or the user explicitly says "stuck on X".

7. **Be specific with numbers.** "Improved performance" is vague.
   "Reduced login latency by ~40%" is specific. Pull numbers from commit
   messages, PR descriptions, or diff stats. Don't invent them.

8. **Refs help reviewers trust you.** When you have them, populate the `refs`
   array: `["PR #142", "a1b2c3d", "ENG-1234"]`. These show as small chips in
   the HTML report and let a reader click through to verify.

## Output format (for the user-facing text reply)

```
📅 [Day, Date]

✅ [Plain-English summary of what was accomplished]
   → [Why it matters — who it unblocks, what risk it reduces, what it enables]

⏳ In progress: [What is being worked on]
   → [Expected outcome when complete]

🚫 Blocked: [What is stuck]
   → [What's needed to unblock]

📁 [N] files changed across [brief description of areas touched]
   [N] commit(s) on [branch name]
```

If a bullet is `inferred`, the HTML report will mark it with an "inferred"
chip automatically — you don't need to do anything special in the text reply.

## Tone

- Write for a non-technical manager. No jargon that isn't in the glossary.
- Short sentences. No filler. Skip "this change" / "this commit" constructions.
- Confident — if you know the impact, state it. If you don't, label it
  `inferred` and use phrases like "technical foundation work for X". Never
  hedge with "might potentially" or "could possibly".
- 2 accurate bullets beat 5 vague ones.

## Anti-patterns

- ❌ Restating commit messages verbatim ("refactor: extract middleware")
- ❌ Inventing impact you can't ground in the data ("saves 10 hours per week")
- ❌ Mixing provenance — one bullet pulled from PR + one from inference labeled the same way
- ❌ Using `done` status when the work is genuinely in progress
- ❌ Writing 5+ bullets to look productive — pick the 2-3 that actually mattered
