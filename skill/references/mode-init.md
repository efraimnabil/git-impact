# Mode: init

Configure or update the repo's `context.json` interactively. Ask one
question at a time:

1. *"What does your company/product do? (1–2 sentences)"*
2. *"What does your manager care most about?"*
3. *"Technical terms to translate? Format: RLS=data security, MFA=login security (blank to skip)"*

Then call **`update_context`** with the answers. Tell the user:
*"Saved to `.git-impact/context.json`. Commit this to share the glossary with your team."*

If the install also wrote SKILL.md folders for other editors (Cursor,
Copilot, Gemini, OpenCode, Goose, Amp, Codex, Kiro, Roo, Factory, …),
point that out so they know the same workflow works elsewhere.
