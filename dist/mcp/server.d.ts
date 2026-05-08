#!/usr/bin/env node
/**
 * git-impact MCP server
 *
 * Architecture: data-only. This server never calls Claude.
 * It exposes three MCP primitives:
 *
 *   Tools     — actions Claude calls to read/write data
 *   Resources — semi-static data Claude reads (user context, history overview)
 *   Prompts   — computed templates: fetch live data + embed translation instructions
 *               so Claude Code does the AI work inside its own session, no API key needed
 */
export {};
//# sourceMappingURL=server.d.ts.map