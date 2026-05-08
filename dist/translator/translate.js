"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateActivity = translateActivity;
exports.generateReview = generateReview;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const prompt_1 = require("./prompt");
function getAnthropicKey(context) {
    const key = context?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
        throw new Error("No Anthropic API key found. Run `git-impact init` to set one, or set ANTHROPIC_API_KEY env var.");
    }
    return key;
}
async function translateActivity(git, github, context, dateLabel) {
    const client = new sdk_1.default({ apiKey: getAnthropicKey(context) });
    const input = { git, github, context, dateLabel };
    const prompt = (0, prompt_1.buildPrompt)(input);
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
        system: "You are a concise technical writer. Always respond with valid JSON only. No markdown, no explanation outside the JSON object.",
        messages: [{ role: "user", content: prompt }],
    });
    const text = message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
    let parsed;
    try {
        // strip possible markdown code fences
        const clean = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
        parsed = JSON.parse(clean);
    }
    catch {
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
async function generateReview(entries, context, periodLabel) {
    const client = new sdk_1.default({ apiKey: getAnthropicKey(context) });
    const prompt = (0, prompt_1.buildReviewPrompt)(entries, context, periodLabel);
    const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: "You are a professional technical writer. Always respond with valid JSON only. No markdown outside the JSON.",
        messages: [{ role: "user", content: prompt }],
    });
    const text = message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
    const clean = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    return JSON.parse(clean);
}
//# sourceMappingURL=translate.js.map