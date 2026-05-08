"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readGitHubActivity = readGitHubActivity;
const rest_1 = require("@octokit/rest");
function parseRepoFromRemote(remoteUrl) {
    // handles https://github.com/owner/repo.git and git@github.com:owner/repo.git
    const httpsMatch = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (httpsMatch) {
        return { owner: httpsMatch[1], repo: httpsMatch[2].replace(/\.git$/, "") };
    }
    return null;
}
async function readGitHubActivity(token, remoteUrl, since, until = new Date()) {
    const parsed = parseRepoFromRemote(remoteUrl);
    if (!parsed)
        return null;
    const octokit = new rest_1.Octokit({ auth: token });
    const { owner, repo } = parsed;
    const username = await octokit.users.getAuthenticated().then((r) => r.data.login).catch(() => null);
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();
    const [openedPRs, mergedPRs, reviewedPRs] = await Promise.allSettled([
        username
            ? octokit.rest.pulls.list({
                owner, repo, state: "all", sort: "created", direction: "desc", per_page: 50,
            }).then((r) => r.data.filter((pr) => pr.user?.login === username &&
                pr.created_at >= sinceIso &&
                pr.created_at <= untilIso))
            : Promise.resolve([]),
        octokit.rest.pulls.list({
            owner, repo, state: "closed", sort: "updated", direction: "desc", per_page: 50,
        }).then((r) => r.data.filter((pr) => pr.merged_at &&
            pr.merged_at >= sinceIso &&
            pr.merged_at <= untilIso)),
        username
            ? octokit.rest.pulls.list({
                owner, repo, state: "all", sort: "updated", direction: "desc", per_page: 50,
            }).then(async (r) => {
                const reviewed = [];
                for (const pr of r.data.slice(0, 20)) {
                    const reviews = await octokit.rest.pulls.listReviews({
                        owner, repo, pull_number: pr.number,
                    }).catch(() => ({ data: [] }));
                    if (reviews.data.some((rv) => rv.user?.login === username &&
                        rv.submitted_at &&
                        rv.submitted_at >= sinceIso &&
                        rv.submitted_at <= untilIso)) {
                        reviewed.push(pr);
                    }
                }
                return reviewed;
            })
            : Promise.resolve([]),
    ]);
    const toPRInfo = async (pr) => {
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
    const mapSettled = async (result) => {
        if (result.status === "rejected")
            return [];
        return Promise.all(result.value.map(toPRInfo));
    };
    return {
        prsOpened: await mapSettled(openedPRs),
        prsMerged: await mapSettled(mergedPRs),
        prsReviewed: await mapSettled(reviewedPRs),
        repoFullName: `${owner}/${repo}`,
    };
}
//# sourceMappingURL=github.js.map