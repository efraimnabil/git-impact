import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { readGitActivity, startOfDay, startOfDaysAgo } from "../readers/git";
import { readGitHubActivity } from "../readers/github";
import {
  loadContext,
  saveContext,
  saveEntry,
  getEntriesForDaysAgo,
  getEntriesForRange,
  ImpactItem,
  UserContext,
} from "../storage/db";
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
      "Persist a completed impact translation to this repo's local history (.git-impact/history.db). " +
      "Call after translating commits into business impact bullets.",
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
            required: ["status", "summary", "impact"],
            properties: {
              status: { type: "string", enum: ["done", "in_progress"] },
              summary: { type: "string" },
              impact: { type: "string" },
              technical_note: { type: "string" },
            },
          },
        },
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
    case "get_history":          return handleGetHistory(args);
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

  try {
    const git = await readGitActivity(repo.path, since, until);
    return ok(JSON.stringify({ ...git, _repo_root: repo.path }, null, 2));
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
