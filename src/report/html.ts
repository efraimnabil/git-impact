/**
 * Generates a self-contained HTML report from saved standup history.
 * Open `.git-impact/result.html` directly in a browser via file://
 *  → optional ?date=YYYY-MM-DD selects a specific day
 */

export interface ReportItem {
  status: "done" | "in_progress" | "blocked";
  summary: string;
  impact?: string;
  technical_note?: string;
  provenance?: "pr" | "commit_body" | "commit_message" | "ticket" | "inferred";
  refs?: string[];
}

export interface ReportEntry {
  date: string;            // YYYY-MM-DD
  repoName: string;
  totalCommits: number;
  totalFiles: number;
  filesSummary?: string;
  items: ReportItem[];
}

export function renderReportHtml(entries: ReportEntry[], repoName: string): string {
  // Newest first for the picker
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const dataJson = JSON.stringify(sorted).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>git-impact — ${escapeHtml(repoName)}</title>
<style>
  :root {
    --bg: #0d1117;
    --panel: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --muted: #8b949e;
    --accent: #58a6ff;
    --green: #3fb950;
    --amber: #d29922;
    --red: #f85149;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #ffffff;
      --panel: #f6f8fa;
      --border: #d0d7de;
      --text: #1f2328;
      --muted: #59636e;
      --accent: #0969da;
      --green: #1a7f37;
      --amber: #9a6700;
      --red: #cf222e;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.55;
  }
  header {
    border-bottom: 1px solid var(--border);
    padding: 18px 28px;
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
    background: var(--panel);
  }
  header h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  header .repo {
    color: var(--muted);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 13px;
  }
  header .spacer { flex: 1; }
  header select {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 13px;
    font-family: inherit;
  }
  main {
    max-width: 760px;
    margin: 0 auto;
    padding: 36px 28px 80px;
  }
  .date {
    font-size: 28px;
    font-weight: 600;
    margin: 0 0 6px;
    letter-spacing: -0.02em;
  }
  .meta {
    color: var(--muted);
    font-size: 13px;
    margin-bottom: 32px;
  }
  .item {
    border-left: 3px solid var(--border);
    padding: 6px 0 6px 18px;
    margin: 0 0 24px;
  }
  .item.done { border-color: var(--green); }
  .item.in_progress { border-color: var(--amber); }
  .item.blocked { border-color: var(--red); }
  .item .summary {
    font-weight: 600;
    margin-bottom: 6px;
  }
  .item .summary::before {
    margin-right: 8px;
  }
  .item.done .summary::before { content: "✅"; }
  .item.in_progress .summary::before { content: "⏳"; }
  .item.blocked .summary::before { content: "🚫"; }
  .item .impact {
    color: var(--muted);
    font-size: 14px;
  }
  .item .impact::before {
    content: "→ ";
    color: var(--accent);
  }
  .item .note {
    color: var(--muted);
    font-size: 12px;
    margin-top: 4px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
  }
  .item .meta {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .chip {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    border: 1px solid var(--border);
    color: var(--muted);
    background: transparent;
  }
  .chip.inferred {
    border-color: var(--amber);
    color: var(--amber);
  }
  .chip.ref {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
  }
  footer {
    color: var(--muted);
    font-size: 12px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    margin-top: 40px;
  }
  .empty {
    text-align: center;
    color: var(--muted);
    padding: 80px 0;
  }
  @media print {
    header { display: none; }
    main { max-width: none; padding: 0; }
  }
</style>
</head>
<body>
<header>
  <h1>git-impact</h1>
  <span class="repo">${escapeHtml(repoName)}</span>
  <span class="spacer"></span>
  <select id="date-picker" aria-label="Select date"></select>
</header>
<main id="content"><div class="empty">Loading…</div></main>
<script>
  const ENTRIES = ${dataJson};

  const picker = document.getElementById("date-picker");
  const content = document.getElementById("content");

  function getRequestedDate() {
    const params = new URLSearchParams(window.location.search);
    return params.get("date");
  }

  function formatDateLabel(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
  }

  function renderEntry(entry) {
    if (!entry) {
      content.innerHTML = '<div class="empty">No standup found for that date.</div>';
      return;
    }
    const items = entry.items.map(function(item) {
      const cls = item.status || "done";
      const note = item.technical_note
        ? '<div class="note">' + escape(item.technical_note) + '</div>' : '';
      const impact = item.impact
        ? '<div class="impact">' + escape(item.impact) + '</div>' : '';
      const chips = [];
      if (item.provenance === "inferred") {
        chips.push('<span class="chip inferred" title="Impact inferred — not stated explicitly in PR or commit body">inferred</span>');
      }
      if (Array.isArray(item.refs)) {
        for (const ref of item.refs) {
          chips.push('<span class="chip ref">' + escape(ref) + '</span>');
        }
      }
      const meta = chips.length
        ? '<div class="meta">' + chips.join("") + '</div>' : '';
      return '<div class="item ' + cls + '">' +
        '<div class="summary">' + escape(item.summary) + '</div>' +
        impact + note + meta +
        '</div>';
    }).join("");

    const filesLine = entry.filesSummary
      ? '📁 ' + entry.totalFiles + ' files — ' + escape(entry.filesSummary) + '<br>'
      : '📁 ' + entry.totalFiles + ' files changed<br>';

    content.innerHTML =
      '<h2 class="date">📅 ' + formatDateLabel(entry.date) + '</h2>' +
      '<div class="meta">' + entry.totalCommits + ' commit(s) on ' + escape(entry.repoName) + '</div>' +
      items +
      '<footer>' + filesLine + '</footer>';
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c];
    });
  }

  // Populate date picker (newest first)
  ENTRIES.forEach(function(e) {
    const opt = document.createElement("option");
    opt.value = e.date;
    opt.textContent = formatDateLabel(e.date);
    picker.appendChild(opt);
  });

  // Default to ?date= in URL or newest
  const requested = getRequestedDate();
  const defaultDate = requested || (ENTRIES[0] && ENTRIES[0].date);
  if (defaultDate) {
    picker.value = defaultDate;
    renderEntry(ENTRIES.find(function(e) { return e.date === defaultDate; }));
  } else {
    content.innerHTML = '<div class="empty">No standups saved yet. Run "do my standup" in your repo.</div>';
  }

  picker.addEventListener("change", function() {
    const params = new URLSearchParams(window.location.search);
    params.set("date", picker.value);
    history.replaceState(null, "", "?" + params.toString());
    renderEntry(ENTRIES.find(function(e) { return e.date === picker.value; }));
  });
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]!));
}
