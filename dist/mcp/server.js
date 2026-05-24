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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const tools_js_1 = require("./tools.js");
const resources_js_1 = require("./resources.js");
const prompts_js_1 = require("./prompts.js");
const path = __importStar(require("path"));
// Read version from package.json so it never drifts from the published package.
// __dirname is dist/mcp/ at runtime → ../../package.json is the package root.
const { version: PKG_VERSION } = require(path.resolve(__dirname, "..", "..", "package.json"));
// ─── Server setup ────────────────────────────────────────────────────────────
const server = new index_js_1.Server({ name: "git-impact", version: PKG_VERSION }, {
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