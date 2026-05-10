import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import {
  CLAUDE_MD_BLOCK,
  COPILOT_INSTRUCTIONS,
  CURSOR_RULES,
  GEMINI_COMMAND,
  CONTEXT_TEMPLATE,
} from "./templates";

/**
 * The shipped `skill/` directory inside the published npm package.
 * Resolved relative to this file's location at runtime — works whether
 * we're running from `dist/init/installer.js` (published) or `src/init/`.
 */
function shippedSkillDir(): string {
  // dist/init/installer.js → ../../skill
  // src/init/installer.ts  → ../../skill
  return path.resolve(__dirname, "..", "..", "skill");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface InstallOptions {
  repoRoot: string;
  integrations: Integration[];
  context: RepoContext;
  silent?: boolean;
}

export type Integration = "claude" | "copilot" | "cursor" | "gemini";

export interface RepoContext {
  companyDescription: string;
  managerPriorities: string;
  glossary: Record<string, string>;
}

export interface InstalledFile {
  path: string;
  action: "created" | "updated" | "skipped";
}

/**
 * Core install function — idempotent, safe to run multiple times.
 * Creates all integration files, context.json, updates CLAUDE.md and .gitignore.
 * Returns a manifest of every file it touched.
 */
export function install(opts: InstallOptions): InstalledFile[] {
  const { repoRoot, integrations, context } = opts;
  const installed: InstalledFile[] = [];

  // 1. Create .git-impact/ directory and context.json
  const gitImpactDir = path.join(repoRoot, ".git-impact");
  fs.mkdirSync(gitImpactDir, { recursive: true });

  const contextPath = path.join(gitImpactDir, "context.json");
  installed.push(
    writeFile(contextPath, CONTEXT_TEMPLATE(
      context.companyDescription,
      context.managerPriorities,
      context.glossary
    ))
  );

  // 2. Update .gitignore
  installed.push(ensureGitignore(repoRoot));

  // 3. Per-integration files
  for (const integration of integrations) {
    installed.push(...installIntegration(repoRoot, integration));
  }

  // 4. Update CLAUDE.md if Claude integration selected
  if (integrations.includes("claude")) {
    installed.push(updateClaudeMd(repoRoot));
  }

  // 5. Write manifest
  const manifest = {
    version: "0.1.0",
    installedAt: new Date().toISOString(),
    integrations,
    files: installed.map((f) => path.relative(repoRoot, f.path)),
  };
  const manifestPath = path.join(gitImpactDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  return installed;
}

// ─── Per-integration installers ───────────────────────────────────────────────

function installIntegration(repoRoot: string, integration: Integration): InstalledFile[] {
  switch (integration) {
    case "claude":
      return installClaude(repoRoot);
    case "copilot":
      return installCopilot(repoRoot);
    case "cursor":
      return installCursor(repoRoot);
    case "gemini":
      return installGemini(repoRoot);
  }
}

function installClaude(repoRoot: string): InstalledFile[] {
  const skillDir = path.join(repoRoot, ".claude", "skills", "git-impact");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.mkdirSync(path.join(skillDir, "references"), { recursive: true });

  const src = shippedSkillDir();
  const installed: InstalledFile[] = [];

  // Copy SKILL.md and any reference files from the shipped skill directory.
  installed.push(
    copyFile(path.join(src, "SKILL.md"), path.join(skillDir, "SKILL.md"))
  );
  const refsSrc = path.join(src, "references");
  if (fs.existsSync(refsSrc)) {
    for (const file of fs.readdirSync(refsSrc)) {
      installed.push(
        copyFile(
          path.join(refsSrc, file),
          path.join(skillDir, "references", file)
        )
      );
    }
  }
  return installed;
}

function installCopilot(repoRoot: string): InstalledFile[] {
  const dir = path.join(repoRoot, ".github", "instructions");
  fs.mkdirSync(dir, { recursive: true });
  return [writeFile(path.join(dir, "git-impact.instructions.md"), COPILOT_INSTRUCTIONS)];
}

function installCursor(repoRoot: string): InstalledFile[] {
  const dir = path.join(repoRoot, ".cursor", "rules");
  fs.mkdirSync(dir, { recursive: true });
  return [writeFile(path.join(dir, "git-impact.mdc"), CURSOR_RULES)];
}

function installGemini(repoRoot: string): InstalledFile[] {
  const dir = path.join(repoRoot, ".gemini", "commands");
  fs.mkdirSync(dir, { recursive: true });
  return [writeFile(path.join(dir, "git-impact.md"), GEMINI_COMMAND)];
}

// ─── CLAUDE.md managed block ──────────────────────────────────────────────────

const BLOCK_START = "<!-- GIT-IMPACT START -->";
const BLOCK_END = "<!-- GIT-IMPACT END -->";

function updateClaudeMd(repoRoot: string): InstalledFile {
  const claudeMdPath = path.join(repoRoot, "CLAUDE.md");
  const block = `${BLOCK_START}\n${CLAUDE_MD_BLOCK.trim()}\n${BLOCK_END}`;

  if (!fs.existsSync(claudeMdPath)) {
    fs.writeFileSync(claudeMdPath, `# Project\n\n${block}\n`);
    return { path: claudeMdPath, action: "created" };
  }

  const existing = fs.readFileSync(claudeMdPath, "utf-8");
  const startIdx = existing.indexOf(BLOCK_START);
  const endIdx = existing.indexOf(BLOCK_END);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing block
    const updated = existing.slice(0, startIdx) + block + existing.slice(endIdx + BLOCK_END.length);
    fs.writeFileSync(claudeMdPath, updated);
    return { path: claudeMdPath, action: "updated" };
  }

  // Append block
  fs.writeFileSync(claudeMdPath, existing.trimEnd() + "\n\n" + block + "\n");
  return { path: claudeMdPath, action: "updated" };
}

// ─── .gitignore ───────────────────────────────────────────────────────────────

const GITIGNORE_ENTRY = ".git-impact/history.db";

function ensureGitignore(repoRoot: string): InstalledFile {
  const gitignorePath = path.join(repoRoot, ".gitignore");
  const existing = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf-8")
    : "";

  if (existing.includes(GITIGNORE_ENTRY)) {
    return { path: gitignorePath, action: "skipped" };
  }

  fs.appendFileSync(
    gitignorePath,
    `\n# git-impact local history (private, per-machine)\n${GITIGNORE_ENTRY}\n`
  );
  return { path: gitignorePath, action: "updated" };
}

// ─── Editor auto-detection ───────────────────────────────────────────────────

/**
 * Look for editor-specific directories in the repo. Returns whichever editors
 * already have config there, in stable order. Lets `init` skip the "which AI
 * tools do you use?" question when the answer is obvious from the filesystem.
 */
export function detectEditors(repoRoot: string): Integration[] {
  const checks: Array<{ editor: Integration; relPath: string }> = [
    { editor: "claude",  relPath: ".claude" },
    { editor: "copilot", relPath: ".github" },
    { editor: "cursor",  relPath: ".cursor" },
    { editor: "gemini",  relPath: ".gemini" },
  ];
  return checks
    .filter(({ relPath }) => fs.existsSync(path.join(repoRoot, relPath)))
    .map(({ editor }) => editor);
}

// ─── Interactive prompt ───────────────────────────────────────────────────────

/**
 * Run the interactive init wizard. Resolves with the answers.
 * Designed to be called from the CLI `init` command.
 */
export async function runInitWizard(repoRoot: string): Promise<{
  context: RepoContext;
  integrations: Integration[];
}> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> =>
    new Promise((res) => rl.question(q, (a) => res(a.trim())));

  const existingContext = loadExistingContext(repoRoot);

  console.log(`\n  git-impact init\n  ${"─".repeat(36)}\n`);
  console.log(`  Repo: ${repoRoot}`);
  console.log(`  Files will be committed with your team.\n`);

  const companyDescription = await ask(
    `  What does your company/product do? (1–2 sentences)\n` +
    (existingContext?.companyDescription ? `  [current: ${existingContext.companyDescription}]\n` : "") +
    `  > `
  );

  const managerPriorities = await ask(
    `\n  What does your manager care most about?\n` +
    `  e.g. "Shipping on time, not breaking prod"\n` +
    (existingContext?.managerPriorities ? `  [current: ${existingContext.managerPriorities}]\n` : "") +
    `  > `
  );

  const glossaryInput = await ask(
    `\n  Technical terms to translate? (optional)\n` +
    `  Format: "RLS=data security, MFA=login security"\n` +
    (existingContext?.glossary && Object.keys(existingContext.glossary).length > 0
      ? `  [current: ${Object.entries(existingContext.glossary).map(([k, v]) => `${k}=${v}`).join(", ")}]\n`
      : "") +
    `  > `
  );

  const detected = detectEditors(repoRoot);
  const detectedLabel =
    detected.length > 0
      ? detected.join(", ")
      : "none detected — defaulting to claude";

  const integrationsInput = await ask(
    `\n  Which AI editors should I install for? (comma-separated, or "all")\n` +
    `  Options: claude, copilot, cursor, gemini\n` +
    `  Detected in this repo: ${detectedLabel}\n` +
    `  [press Enter to use detected]\n` +
    `  > `
  );

  rl.close();

  // Parse glossary
  const glossary: Record<string, string> = { ...(existingContext?.glossary ?? {}) };
  if (glossaryInput) {
    for (const pair of glossaryInput.split(",")) {
      const [term, meaning] = pair.split("=").map((s) => s.trim());
      if (term && meaning) glossary[term] = meaning;
    }
  }

  // Parse integrations
  const ALL_INTEGRATIONS: Integration[] = ["claude", "copilot", "cursor", "gemini"];
  let integrations: Integration[];
  const raw = integrationsInput.toLowerCase().trim();
  if (!raw) {
    // Empty input → use what we detected, or claude as the safe default.
    integrations = detected.length > 0 ? detected : ["claude"];
  } else if (raw === "all") {
    integrations = ALL_INTEGRATIONS;
  } else {
    integrations = raw
      .split(",")
      .map((s) => s.trim() as Integration)
      .filter((s) => ALL_INTEGRATIONS.includes(s));
    if (integrations.length === 0) integrations = detected.length > 0 ? detected : ["claude"];
  }

  return {
    context: {
      companyDescription: companyDescription || existingContext?.companyDescription || "",
      managerPriorities:  managerPriorities  || existingContext?.managerPriorities  || "",
      glossary,
    },
    integrations,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function writeFile(filePath: string, content: string): InstalledFile {
  const existed = fs.existsSync(filePath);
  fs.writeFileSync(filePath, content, "utf-8");
  return { path: filePath, action: existed ? "updated" : "created" };
}

function copyFile(srcPath: string, destPath: string): InstalledFile {
  const existed = fs.existsSync(destPath);
  fs.copyFileSync(srcPath, destPath);
  return { path: destPath, action: existed ? "updated" : "created" };
}

function loadExistingContext(repoRoot: string): RepoContext | null {
  const contextPath = path.join(repoRoot, ".git-impact", "context.json");
  if (!fs.existsSync(contextPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(contextPath, "utf-8"));
  } catch {
    return null;
  }
}
