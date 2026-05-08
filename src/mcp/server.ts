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

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { TOOL_DEFINITIONS, handleTool } from "./tools.js";
import { RESOURCE_DEFINITIONS, handleReadResource } from "./resources.js";
import { PROMPT_DEFINITIONS, handleGetPrompt } from "./prompts.js";

// ─── Server setup ────────────────────────────────────────────────────────────

const server = new Server(
  { name: "git-impact", version: "0.1.0" },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// ─── Tools ───────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleTool(name, (args ?? {}) as Record<string, unknown>);
});

// ─── Resources ───────────────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: RESOURCE_DEFINITIONS,
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  return handleReadResource(request.params.uri);
});

// ─── Prompts ─────────────────────────────────────────────────────────────────

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: PROMPT_DEFINITIONS,
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleGetPrompt(name, args as Record<string, string> | undefined);
});

// ─── Start ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("git-impact MCP server failed to start:", err);
  process.exit(1);
});
