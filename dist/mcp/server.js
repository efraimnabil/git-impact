#!/usr/bin/env node
"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const tools_js_1 = require("./tools.js");
const resources_js_1 = require("./resources.js");
const prompts_js_1 = require("./prompts.js");
// ─── Server setup ────────────────────────────────────────────────────────────
const server = new index_js_1.Server({ name: "git-impact", version: "0.1.0" }, {
    capabilities: {
        tools: {},
        resources: {},
        prompts: {},
    },
});
// ─── Tools ───────────────────────────────────────────────────────────────────
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: tools_js_1.TOOL_DEFINITIONS,
}));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return (0, tools_js_1.handleTool)(name, (args ?? {}));
});
// ─── Resources ───────────────────────────────────────────────────────────────
server.setRequestHandler(types_js_1.ListResourcesRequestSchema, async () => ({
    resources: resources_js_1.RESOURCE_DEFINITIONS,
}));
server.setRequestHandler(types_js_1.ReadResourceRequestSchema, async (request) => {
    return (0, resources_js_1.handleReadResource)(request.params.uri);
});
// ─── Prompts ─────────────────────────────────────────────────────────────────
server.setRequestHandler(types_js_1.ListPromptsRequestSchema, async () => ({
    prompts: prompts_js_1.PROMPT_DEFINITIONS,
}));
server.setRequestHandler(types_js_1.GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return (0, prompts_js_1.handleGetPrompt)(name, args);
});
// ─── Start ───────────────────────────────────────────────────────────────────
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    console.error("git-impact MCP server failed to start:", err);
    process.exit(1);
});
//# sourceMappingURL=server.js.map