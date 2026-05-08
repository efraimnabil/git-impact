import { Octokit } from "@octokit/rest";

export interface PullRequestInfo {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed" | "merged";
  body: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: string[];
  mergedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubSummary {
  prsOpened: PullRequestInfo[];
  prsMerged: PullRequestInfo[];
  prsReviewed: PullRequestInfo[];
  repoFullName: string;
}

function parseRepoFromRemote(remoteUrl: string): { owner: string; repo: string } | null {
  // handles https://github.com/owner/repo.git and git@github.com:owner/repo.git
  const httpsMatch = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2].replace(/\.git$/, "") };
  }
  return null;
}

export async function readGitHubActivity(
  token: string,
  remoteUrl: string,
  since: Date,
  until: Date = new Date()
): Promise<GitHubSummary | null> {
  const parsed = parseRepoFromRemote(remoteUrl);
  if (!parsed) return null;

  const octokit = new Octokit({ auth: token });
  const { owner, repo } = parsed;
  const username = await octokit.users.getAuthenticated().then((r) => r.data.login).catch(() => null);

  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const [openedPRs, mergedPRs, reviewedPRs] = await Promise.allSettled([
    username
      ? octokit.rest.pulls.list({
          owner, repo, state: "all", sort: "created", direction: "desc", per_page: 50,
        }).then((r) =>
          r.data.filter(
            (pr) =>
              pr.user?.login === username &&
              pr.created_at >= sinceIso &&
              pr.created_at <= untilIso
          )
        )
      : Promise.resolve([]),

    octokit.rest.pulls.list({
      owner, repo, state: "closed", sort: "updated", direction: "desc", per_page: 50,
    }).then((r) =>
      r.data.filter(
        (pr) =>
          pr.merged_at &&
          pr.merged_at >= sinceIso &&
          pr.merged_at <= untilIso
      )
    ),

    username
      ? octokit.rest.pulls.list({
          owner, repo, state: "all", sort: "updated", direction: "desc", per_page: 50,
        }).then(async (r) => {
          const reviewed: typeof r.data = [];
          for (const pr of r.data.slice(0, 20)) {
            const reviews = await octokit.rest.pulls.listReviews({
              owner, repo, pull_number: pr.number,
            }).catch(() => ({ data: [] }));
            if (reviews.data.some(
              (rv) =>
                rv.user?.login === username &&
                rv.submitted_at &&
                rv.submitted_at >= sinceIso &&
                rv.submitted_at <= untilIso
            )) {
              reviewed.push(pr);
            }
          }
          return reviewed;
        })
      : Promise.resolve([]),
  ]);

  const toPRInfo = async (pr: {
    number: number; title: string; html_url: string; state: string;
    body?: string | null; additions?: number; deletions?: number; changed_files?: number;
    labels: Array<{ name?: string }>; merged_at?: string | null; created_at: string; updated_at: string;
  }): Promise<PullRequestInfo> => {
    let additions = pr.additions ?? 0;
    let deletions = pr.deletions ?? 0;
    let changedFiles = pr.changed_files ?? 0;

    if (!pr.additions) {
      const detail = await octokit.rest.pulls.get({ owner, repo, pull_number: pr.number }).catch(() => null);
      if (detail) {
        additions = detail.data.additions;
        deletions = detail.data.deletions;
        changedFiles = detail.data.changed_files;
      }
    }

    return {
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      state: pr.merged_at ? "merged" : pr.state === "closed" ? "closed" : "open",
      body: pr.body?.slice(0, 500) ?? "",
      additions,
      deletions,
      changedFiles,
      labels: pr.labels.map((l) => l.name ?? ""),
      mergedAt: pr.merged_at ?? null,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    };
  };

  const mapSettled = async (result: PromiseSettledResult<unknown[]>) => {
    if (result.status === "rejected") return [];
    return Promise.all((result.value as Parameters<typeof toPRInfo>[0][]).map(toPRInfo));
  };

  return {
    prsOpened: await mapSettled(openedPRs),
    prsMerged: await mapSettled(mergedPRs),
    prsReviewed: await mapSettled(reviewedPRs),
    repoFullName: `${owner}/${repo}`,
  };
}
