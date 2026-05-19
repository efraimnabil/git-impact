# Mode: review

Synthesise saved standup history into a performance-review evidence pack.
Not a finished review — bullets carry dates and refs the user can paste
into their own writing.

## Steps

1. Parse the period from the user's message:
   - "last 30 days" / "30d" → `last_days: 30`
   - "last 90 days" / "90d" / no arg → `last_days: 90`
   - "Q2-2026" → `from_date: 2026-04-01`, `to_date: 2026-06-30`
2. Call **`get_history`** with the parsed window.
3. If no entries returned: tell the user
   *"No saved history yet for this period. Use the standup mode daily to
   build up history, then come back."* and stop.
4. Synthesise themes (Features, Reliability, Security, Code review,
   Infrastructure). Only include themes that apply.
5. Frame as **performance review prep** (evidence pack), not a finished
   review — bullets should include dates and refs the user can paste into
   their own writing.

## Output

```
Performance Review Prep — [Period]

[One headline sentence — biggest contribution]

🚀 [High-impact theme]
   • Specific achievement [date, refs]

✅ [Medium-impact theme]
   • ...

🔧 [Lower-impact theme]
   • ...

📊 [N] commits across [N] working days
```
