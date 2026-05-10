/**
 * Repo path resolution — priority order:
 *
 *  1. Explicit arg passed by the model ("~/code/my-app")
 *  2. **Sticky cache** — the path we resolved last time on this process.
 *     The skill calls 3-5 MCP tools per standup; resolving once and
 *     reusing avoids the bug where get_git_activity finds a repo via
 *     cwd but save_impact_entry — called moments later — gets a
 *     different cwd and fails.
 *  3. Walk up from process.cwd() until a .git folder is found
 *  4. Fail with a clear message asking the user to set a default
 */
/** Reset the cached path. Used by tests; not part of the public API. */
export declare function _resetStickyRepoForTests(): void;
export declare function resolveRepoPath(explicitPath?: string): {
    path: string;
    source: string;
};
//# sourceMappingURL=repo.d.ts.map