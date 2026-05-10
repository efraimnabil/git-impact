# HTML presentation guide

Read this file ONLY when composing today's bespoke HTML presentation. The
`renderReport` MCP-side renderer handles the rolling dashboard at
`.git-impact/result.html` automatically — this file is for the *daily artifact*
the user can share as a screenshot or paste-into-Slack visual.

## Where to write

Use your `Write` tool to create:
- `<repo>/.git-impact/standups/YYYY-MM-DD.html` — today's bespoke file
- `<repo>/.git-impact/standups/index.html` — list of all standups (regenerate)

## Stack (all CDN — no install)

| Tool | URL | When to use |
|---|---|---|
| Tailwind CSS | `<script src="https://cdn.tailwindcss.com"></script>` | Always |
| Inter font | `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap` | Always |
| Chart.js | `https://cdn.jsdelivr.net/npm/chart.js` | Only if there are real numbers worth charting |
| Mermaid | `https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.esm.min.mjs` | Only for architecture/flow diagrams when relevant |
| Lucide icons | `https://unpkg.com/lucide@latest` | Optional — call `lucide.createIcons()` after DOM ready |

Don't include all of them. Pick what the day's content actually needs.

## Required structure

1. **Hero** — date label + a bold, plain-English headline that captures the day.
   "Shipped safety analytics, hardened tenant isolation" — NOT "9 commits today".
2. **Stats grid** — 3-4 metric cards (commits, files, PRs merged, areas touched).
3. **Achievement cards** — one per ✅ item with status pill, title, summary,
   "→ Why it matters" line, and small chips: PR #, area, file count, plus an
   "inferred" chip when the bullet's provenance is `inferred`.
4. **Optional visual** — only if the content warrants one:
   - Mermaid flow diagram for architecture/data-flow changes
   - Chart.js for ratios/comparisons
   - Code block for a key formula or snippet
   - Skip entirely if the day was straightforward — don't force visuals.
5. **Footer** — file count, commit count, branch, link back to `index.html`.

## Design language

- **Theme:** dark by default (`bg-slate-950`), generous spacing, max width 4xl
- **Cards:** `bg-slate-900/50 border border-slate-800 rounded-2xl p-6`
- **Status pills:**
  - ✅ Shipped → `bg-emerald-500/20 text-emerald-400`
  - ⏳ In Progress → `bg-amber-500/20 text-amber-400`
  - 🚫 Blocked → `bg-rose-500/20 text-rose-400`
- **Inferred chip:** `bg-amber-500/10 text-amber-300/70 border border-amber-500/30`
  with title attribute "Impact inferred — not explicitly stated in PR or commit"
- **Print-friendly:** include `@media print { ... }` that hides nav and switches to light theme
- **Spacing:** `max-w-4xl mx-auto px-8 py-12`, `space-y-6` between cards
- **Typography:** Inter, tight letter-spacing on headlines, 1.6 line-height on body

## Skeleton (adapt content to today's actual work)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
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
    <header class="mb-16">
      <p class="text-sm uppercase tracking-widest text-slate-500 font-medium">[Saturday, May 9, 2026]</p>
      <h1 class="mt-3 text-5xl font-bold tracking-tight leading-tight">[Headline that captures the day]</h1>
      <p class="mt-4 text-xl text-slate-400 max-w-2xl">[One-sentence subtitle]</p>
    </header>

    <section class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
      <div class="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
        <div class="text-3xl font-bold">[N]</div>
        <div class="text-sm text-slate-400 mt-1">commits</div>
      </div>
      <!-- ... 3 more stat cards -->
    </section>

    <section class="space-y-4 mb-16">
      <h2 class="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-4">Shipped today</h2>
      <article class="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
        <div class="flex items-start gap-4">
          <span class="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-medium">✅ Shipped</span>
          <div class="flex-1">
            <h3 class="text-lg font-semibold">[Plain-English title]</h3>
            <p class="text-slate-300 mt-2 leading-relaxed">[One-sentence summary]</p>
            <p class="text-slate-400 mt-3 text-sm">→ [Why it matters in business terms]</p>
            <div class="flex gap-2 mt-4 flex-wrap">
              <span class="text-xs px-2 py-0.5 rounded-full border border-slate-700 text-slate-400">PR #142</span>
              <!-- Add an inferred chip when provenance === "inferred" -->
              <span class="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300/70 border border-amber-500/30" title="Impact inferred">inferred</span>
            </div>
          </div>
        </div>
      </article>
    </section>

    <footer class="pt-8 border-t border-slate-800 text-sm text-slate-500 flex justify-between">
      <span>[N] files · [N] commits · [branch]</span>
      <a href="./index.html" class="hover:text-slate-300">← All standups</a>
    </footer>
  </main>
</body>
</html>
```

## Index page

`<repo>/.git-impact/standups/index.html` should list every daily HTML file
(newest first). Same dark theme, simple grid of cards each linking to its day.
Keep it lightweight — don't re-render everything, just enumerate files.

## Final line

After writing both files, print exactly this on the LAST line of your reply:

```
🎯 file:///<repo-absolute-path>/.git-impact/standups/YYYY-MM-DD.html
```

Use the real absolute path so the user can ⌘-click.
