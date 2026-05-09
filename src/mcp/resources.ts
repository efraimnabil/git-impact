import { Resource, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { loadContext, getEntriesForDaysAgo } from "../storage/db";
import { resolveRepoPath } from "./repo";

const CONTEXT_URI      = "git-impact://context";
const HISTORY_URI      = "git-impact://history/overview";

export const RESOURCE_DEFINITIONS: Resource[] = [
  {
    uri: CONTEXT_URI,
    name: "Project Context",
    description:
      "This repo's personalization: company description, manager priorities, and glossary. " +
      "Stored in .git-impact/context.json — committable and team-shareable. " +
      "Claude reads this automatically when translating commits.",
    mimeType: "application/json",
  },
  {
    uri: HISTORY_URI,
    name: "History Overview",
    description:
      "Summary of saved standup entries for the current repo: date range, total commits, days tracked. " +
      "Check before generating a performance review to confirm enough history exists.",
    mimeType: "application/json",
  },
];

export function handleReadResource(uri: string): ReadResourceResult {
  // Resolve repo for both resources — safe to fail gracefully
  let repoRoot: string | null = null;
  try {
    repoRoot = resolveRepoPath().path;
  } catch {
    // repo not found — return a helpful message rather than throwing
  }

  switch (uri) {
    case CONTEXT_URI:
      return readContextResource(repoRoot);
    case HISTORY_URI:
      return readHistoryResource(repoRoot);
    default:
      throw new Error(`Unknown resource URI: ${uri}`);
  }
}

function readContextResource(repoRoot: string | null): ReadResourceResult {
  const payload = repoRoot
    ? (() => {
        const ctx = loadContext(repoRoot);
        return ctx
          ? {
              configured: true,
              repo: repoRoot,
              location: `${repoRoot}/.git-impact/context.json`,
              company_description: ctx.companyDescription,
              manager_priorities:  ctx.managerPriorities,
              glossary:            ctx.glossary,
              has_github_token:    Boolean(ctx.githubToken),
            }
          : {
              configured: false,
              repo: repoRoot,
              location: `${repoRoot}/.git-impact/context.json`,
              message:
                "No context yet. Ask the user to describe their company and priorities, " +
                "then call update_context to save them.",
            };
      })()
    : {
        configured: false,
        message: "No git repository detected. Open a project first.",
      };

  return {
    contents: [{ uri: CONTEXT_URI, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
  };
}

function readHistoryResource(repoRoot: string | null): ReadResourceResult {
  const payload = repoRoot
    ? (() => {
        const entries = getEntriesForDaysAgo(365, repoRoot);
        return entries.length === 0
          ? {
              total_entries: 0,
              repo: repoRoot,
              message: "No history saved yet. Run the standup prompt daily to build history.",
            }
          : {
              total_entries: entries.length,
              repo: repoRoot,
              earliest_date:  entries[0].date,
              latest_date:    entries[entries.length - 1].date,
              total_commits:  entries.reduce((s, e) => s + e.totalCommits, 0),
            };
      })()
    : { total_entries: 0, message: "No git repository detected." };

  return {
    contents: [{ uri: HISTORY_URI, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }],
  };
}
