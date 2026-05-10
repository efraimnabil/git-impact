import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { readGitActivity, startOfDay } from "../readers/git";
import { readGitHubActivity } from "../readers/github";
import {
  loadContext,
  saveContext,
  saveEntry,
  getEntriesForDaysAgo,
  getEntriesForRange,
  getLastEntryDate,
  ImpactItem,
  UserContext,
} from "../storage/db";
import { renderReport } from "../report/render";
import { resolveRepoPath } from "./repo";

// ─── Tool definitions ────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: "get_git_activity",
    description:
      "Read raw git commits and file changes from the current repository. " +
      "Automatically detects the open project — no path needed. " +
      "Returns structured commit data: messages, bodies, changed file paths, and diff stats. " +
      "Always call this first before generating a standup or impact summary.",
    inputSchema: {
      type: "object" as const,
      properties: {
        repo_path: {
          type: "string",
          description:
            "Override the repo path. Omit to auto-detect from the open project.",
        },
        since_iso: {
          type: "string",
          description: "ISO 8601 start time. Defaults to start of today.",
        },
        until_iso: {
          type: "string",
          description: "ISO 8601 end time. Defaults to now.",
        },
      },
    },
  },
  {
    name: "get_github_activity",
    description:
      "Fetch GitHub PR activity (opened, merged, reviewed) for the current repo. " +
      "Requires a GitHub token saved in .git-impact/context.json via update_context.",
    inputSchema: {
      type: "object" as const,
      properties: {
        repo_path: { type: "string", description: "Override the repo path." },
        since_iso: { type: "string", description: "ISO 8601 start time. Defaults to start of today." },
        until_iso: { type: "string", description: "ISO 8601 end time. Defaults to now." },
      },
    },
  },
  {
    name: "save_impact_entry",
    description:
      "Persist a completed impact translation to this repo's local history " +
      "(.git-impact/history.db). Always call this after translating commits into " +
      "business impact bullets — replaces any prior bash/sqlite3 invocations. " +
      "Each item must include a `provenance` so the UI can mark inferred bullets " +
      "differently from claims grounded in PRs or commit bodies. " +
      "ALWAYS pass `repo_path` — use the `_repo_root` value returned by your " +
      "earlier `get_git_activity` call, never rely on cwd auto-detection here.",
    inputSchema: {
      type: "object" as const,
      required: ["date", "repo_name", "items"],
      properties: {
        repo_path: { type: "string", description: "Override the repo path." },
        date: { type: "string", description: "ISO date YYYY-MM-DD." },
        repo_name: { type: "string", description: "Human-readable name e.g. 'org/repo'." },
        total_commits: { type: "number" },
        total_files: { type: "number" },
        files_summary: { type: "string" },
        items: {
          type: "array",
          description: "The translated impact bullets.",
          items: {
            type: "object",
            required: ["status", "summary", "provenance"],
            properties: {
              status: {
                type: "string",
                enum: ["done", "in_progress", "blocked"],
                description: "Outcome state of the work item.",
              },
              summary: { type: "string", description: "Plain-English what." },
              impact: { type: "string", description: "Why it matters — who/what it unblocks." },
              technical_note: { type: "string", description: "Small grey aside (file refs, PR #s)." },
              provenance: {
                type: "string",
                enum: ["pr", "commit_body", "commit_message", "ticket", "inferred"],
                description:
                  "Where the impact claim came from. Use 'pr' if quoted from a PR description, " +
                  "'commit_body' if from a multi-line commit body, 'commit_message' if only the " +
                  "subject line supported it, 'ticket' if pulled from a linked Linear/Jira ticket, " +
                  "'inferred' if you guessed without explicit text. NEVER invent a non-inferred provenance.",
              },
              refs: {
                type: "array",
                items: { type: "string" },
                description: "Supporting refs e.g. ['PR #142', 'a1b2c3d', 'ENG-1234'].",
              },
            },
          },
        },
      },
    },
  },
  {
    name: "get_last_standup_date",
    description:
      "Return the date (YYYY-MM-DD) of the most recently saved standup entry, or null " +
      "if none exists yet. Call this at the start of every standup to default the " +
      "lookback window to 'since last standup' — so days off, weekends, and holidays " +
      "don't drop work on the floor.",
    inputSchema: {
      type: "object" as const,
      properties: {
        repo_path: { type: "string", description: "Override the repo path." },
      },
    },
  },
  {
    name: "get_history",
    description:
      "Retrieve saved impact entries from this repo's history. " +
      "Use when generating a performance review or when the user asks about past work.",
    inputSchema: {
      type: "object" as const,
      properties: {
        repo_path: { type: "string", description: "Override the repo path." },
        last_days: { type: "number", description: "Last N days. Defaults to 30." },
        from_date: { type: "string", description: "ISO date YYYY-MM-DD." },
        to_date: { type: "string", description: "ISO date YYYY-MM-DD." },
      },
    },
  },
  {
    name: "render_dashboard",
    description:
      "Regenerate the rolling HTML dashboard at .git-impact/result.html from the " +
      "saved history. Call this AFTER save_impact_entry so today's entry shows up. " +
      "Returns the file:// URL — print it on the last line of your reply so the " +
      "user can ⌘-click to open. Don't try to open the browser yourself.",
    inputSchema: {
      type: "object" as const,
      properties: {
        repo_path: { type: "string", description: "Override the repo path." },
        date: { type: "string", description: "Optional ?date=YYYY-MM-DD focus to add to the URL." },
      },
    },
  },
  {
    name: "update_context",
    description:
      "Save personalization to this repo's .git-impact/context.json: " +
      "company description, manager priorities, technical glossary, GitHub token. " +
      "context.json can be committed to share settings with teammates. " +
      "Call when the user wants to configure the tool for this project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        repo_path: { type: "string", description: "Override the repo path." },
        company_description: { type: "string" },
        manager_priorities: { type: "string" },
        glossary: {
          type: "object",
          description: "Technical term → plain English. e.g. { 'RLS': 'data security layer' }",
          additionalProperties: { type: "string" },
        },
        github_token: { type: "string" },
      },
    },
  },
];

// ─── Tool handlers ────────────────────────────────────────────────────────────

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export async function handleTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  switch (name) {
    case "get_git_activity":     return handleGetGitActivity(args);
    case "get_github_activity":  return handleGetGitHubActivity(args);
    case "save_impact_entry":    return handleSaveImpactEntry(args);
    case "get_last_standup_date":return handleGetLastStandupDate(args);
    case "get_history":          return handleGetHistory(args);
    case "render_dashboard":     return handleRenderDashboard(args);
    case "update_context":       return handleUpdateContext(args);
    default:                     return error(`Unknown tool: ${name}`);
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleGetGitActivity(args: Record<string, unknown>): Promise<ToolResult> {
  const repo = resolveRepo(args.repo_path as string | undefined);
  if ("error" in repo) return error(repo.error);

  const since = args.since_iso ? new Date(args.since_iso as string) : startOfDay();
  const until = args.until_iso ? new Date(args.until_iso as string) : new Date();

  // Pull privacy config from context.json so filenames like .env / .aws/credentials
  // and obvious-looking secrets in commit bodies are redacted before they reach
  // the translator. Default-on; users can opt out via { privacy: { redact: false } }.
  const ctx = loadContext(repo.path);
  const redactCfg = {
    enabled: ctx?.privacy?.redact !== false,
    filePatterns: ctx?.privacy?.filePatterns,
    valuePatterns: ctx?.privacy?.valuePatterns,
  };

  try {
    const git = await readGitActivity(repo.path, since, until, redactCfg);
    return ok(JSON.stringify({ ...git, _repo_root: repo.path, _redacted: redactCfg.enabled }, null, 2));
  } catch (err) {
    return error(`Could not read git history: ${(err as Error).message}`);
  }
}

async function handleGetGitHubActivity(args: Record<string, unknown>): Promise<ToolResult> {
  const repo = resolveRepo(args.repo_path as string | undefined);
  if ("error" in repo) return error(repo.error);

  const context = loadContext(repo.path);
  if (!context?.githubToken) {
    return error(
      "No GitHub token in .git-impact/context.json. " +
      'Call update_context with github_token first.'
    );
  }

  const since = args.since_iso ? new Date(args.since_iso as string) : startOfDay();
  const until = args.until_iso ? new Date(args.until_iso as string) : new Date();

  try {
    const simpleGit = (await import("simple-git")).default;
    const remotes = await simpleGit(repo.path).getRemotes(true);
    const remoteUrl = remotes.find((r) => r.name === "origin")?.refs?.fetch;
    if (!remoteUrl) return error("No origin remote found.");

    const github = await readGitHubActivity(context.githubToken, remoteUrl, since, until);
    if (!github) return error("Could not parse GitHub repo from remote URL.");

    return ok(JSON.stringify(github, null, 2));
  } catch (err) {
    return error(`GitHub fetch failed: ${(err as Error).message}`);
  }
}

function handleSaveImpactEntry(args: Record<string, unknown>): ToolResult {
  const repo = resolveRepo(args.repo_path as string | undefined);
  if ("error" in repo) return error(repo.error);

  try {
    const id = saveEntry(
      {
        date: args.date as string,
        repoPath: repo.path,
        repoName: args.repo_name as string,
        totalCommits: (args.total_commits as number) || 0,
        totalFiles: (args.total_files as number) || 0,
        filesSummary: (args.files_summary as string) || "",
        items: (args.items as ImpactItem[]) || [],
        rawJson: JSON.stringify(args.items),
        createdAt: new Date().toISOString(),
      },
      repo.path
    );
    return ok(JSON.stringify({ saved: true, id, repo: repo.path }));
  } catch (err) {
    return error(`Failed to save entry: ${(err as Error).message}`);
  }
}

function handleGetLastStandupDate(args: Record<string, unknown>): ToolResult {
  const repo = resolveRepo(args.repo_path as string | undefined);
  if ("error" in repo) return error(repo.error);

  try {
    const date = getLastEntryDate(repo.path);
    return ok(JSON.stringify({ last_standup_date: date }));
  } catch (err) {
    return error(`Failed to read last standup date: ${(err as Error).message}`);
  }
}

function handleGetHistory(args: Record<string, unknown>): ToolResult {
  const repo = resolveRepo(args.repo_path as string | undefined);
  if ("error" in repo) return error(repo.error);

  try {
    const entries =
      args.from_date && args.to_date
        ? getEntriesForRange(args.from_date as string, args.to_date as string, repo.path)
        : getEntriesForDaysAgo((args.last_days as number) || 30, repo.path);

    return ok(JSON.stringify(entries, null, 2));
  } catch (err) {
    return error(`Failed to read history: ${(err as Error).message}`);
  }
}

function handleRenderDashboard(args: Record<string, unknown>): ToolResult {
  const repo = resolveRepo(args.repo_path as string | undefined);
  if ("error" in repo) return error(repo.error);

  try {
    const result = renderReport({
      repoRoot: repo.path,
      open: false, // Never open the browser from inside MCP — just return the URL.
      date: args.date as string | undefined,
    });
    return ok(
      JSON.stringify({
        url: result.url,
        html_path: result.htmlPath,
        entry_count: result.entryCount,
      })
    );
  } catch (err) {
    return error(`Failed to render dashboard: ${(err as Error).message}`);
  }
}

function handleUpdateContext(args: Record<string, unknown>): ToolResult {
  const repo = resolveRepo(args.repo_path as string | undefined);
  if ("error" in repo) return error(repo.error);

  const existing = loadContext(repo.path) ?? {
    companyDescription: "",
    managerPriorities: "",
    glossary: {},
  };

  const updated: UserContext = {
    companyDescription: (args.company_description as string) ?? existing.companyDescription,
    managerPriorities:  (args.manager_priorities as string)  ?? existing.managerPriorities,
    glossary:           (args.glossary as Record<string, string>) ?? existing.glossary,
    githubToken:        (args.github_token as string)         ?? existing.githubToken,
  };

  try {
    saveContext(updated, repo.path);
    return ok(
      JSON.stringify({
        saved: true,
        location: `${repo.path}/.git-impact/context.json`,
        context: {
          ...updated,
          githubToken: updated.githubToken ? "***" : undefined,
        },
      }, null, 2)
    );
  } catch (err) {
    return error(`Failed to save context: ${(err as Error).message}`);
  }
}

// ─── Repo resolution helper ───────────────────────────────────────────────────

function resolveRepo(explicitPath?: string): { path: string } | { error: string } {
  try {
    const { path } = resolveRepoPath(explicitPath);
    return { path };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function error(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
