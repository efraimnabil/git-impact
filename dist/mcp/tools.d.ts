import { Tool } from "@modelcontextprotocol/sdk/types.js";
export declare const TOOL_DEFINITIONS: Tool[];
type ToolResult = {
    content: Array<{
        type: "text";
        text: string;
    }>;
    isError?: boolean;
};
export declare function handleTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
export {};
//# sourceMappingURL=tools.d.ts.map