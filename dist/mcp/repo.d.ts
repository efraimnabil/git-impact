/**
 * Repo path resolution — priority order:
 *
 *  1. Explicit arg passed by Claude (user said "~/code/my-app")
 *  2. Default repo saved in user context (set once, reused forever)
 *  3. Walk up from process.cwd() until a .git folder is found
 *     → works in Claude Code CLI where cwd = open project
 *  4. Fail with a clear message asking the user to set a default
 */
export declare function resolveRepoPath(explicitPath?: string): {
    path: string;
    source: string;
};
//# sourceMappingURL=repo.d.ts.map