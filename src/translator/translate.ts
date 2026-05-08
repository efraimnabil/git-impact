import Anthropic from "@anthropic-ai/sdk";
import { GitSummary } from "../readers/git";
import { GitHubSummary } from "../readers/github";
import { UserContext, ImpactItem } from "../storage/db";
import { buildPrompt, buildReviewPrompt, TranslateInput } from "./prompt";

export interface TranslationResult {
  items: ImpactItem[];
  filesSummary: string;
  totalCommits: number;
  totalFiles: number;
  rawJson: string;
}

export interface ReviewResult {
  period: string;
  themes: Array<{
    name: string;
    bullets: string[];
    impact_level: "high" | "medium" | "low";
  }>;
  stats: {
    total_commits: number;
    working_days: number;
    prs_reviewed: number;
  };
  headline: string;
}

function getAnthropicKey(context: UserContext | null): string {
  const key = context?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "No Anthropic API key found. Run `git-impact init` to set one, or set ANTHROPIC_API_KEY env var."
    );
  }
  return key;
}

export async function translateActivity(
  git: GitSummary,
  github: GitHubSummary | null,
  context: UserContext | null,
  dateLabel: string
): Promise<TranslationResult> {
  const client = new Anthropic({ apiKey: getAnthropicKey(context) });

  const input: TranslateInput = { git, github, context, dateLabel };
  const prompt = buildPrompt(input);

  if (git.commits.length === 0 && !github) {
    return {
      items: [],
      filesSummary: "",
      totalCommits: 0,
      totalFiles: 0,
      rawJson: "{}",
    };
  }

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system:
      "You are a concise technical writer. Always respond with valid JSON only. No markdown, no explanation outside the JSON object.",
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  let parsed: {
    items: ImpactItem[];
    files_summary: string;
    total_commits: number;
    total_files: number;
  };

  try {
    // strip possible markdown code fences
    const clean = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Claude returned invalid JSON:\n${text}`);
  }

  return {
    items: parsed.items ?? [],
    filesSummary: parsed.files_summary ?? "",
    totalCommits: parsed.total_commits ?? git.commits.length,
    totalFiles: parsed.total_files ?? git.totalFilesChanged,
    rawJson: text,
  };
}

export async function generateReview(
  entries: Array<{
    date: string;
    items: Array<{ status: string; summary: string; impact: string }>;
    totalCommits: number;
    repoName: string;
  }>,
  context: UserContext | null,
  periodLabel: string
): Promise<ReviewResult> {
  const client = new Anthropic({ apiKey: getAnthropicKey(context) });

  const prompt = buildReviewPrompt(entries, context, periodLabel);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system:
      "You are a professional technical writer. Always respond with valid JSON only. No markdown outside the JSON.",
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  const clean = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
  return JSON.parse(clean) as ReviewResult;
}
