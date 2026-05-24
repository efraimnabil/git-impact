import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import {
  CLAUDE_MD_BLOCK,
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

// ─── Editor catalog ───────────────────────────────────────────────────────────

/**
 * Editors with verified Agent Skills install paths (per each vendor's
 * published docs as of 2026-05). Adding a new editor here is a one-line
 * change in EDITOR_PATHS below.
 *
 * Goose, Amp, OpenAI Codex, and Letta are NOT listed here because their
 * docs point at the cross-vendor `.agents/skills/` baseline as the
 * recommended project-local path — they're covered by the always-on
 * baseline install, no vendor-specific mirror needed.
 *
 * Kiro, Roo, and Factory have vendor-specific dirs (`.kiro/`, `.roo/`,
 * `.factory/`) that were not personally verified by the author. They
 * may be added in a follow-up once each has been confirmed with a live
 * install in the target editor.
 */
export type Integration =
  | "claude"
  | "copilot"
  | "cursor"
  | "gemini"
  | "opencode"
  | "antigravity";

/**
 * Internal target type — same as Integration plus the always-on baseline.
 * `agents` writes to `.agents/skills/` (cross-vendor standard read by
 * Goose, Amp, Codex, Letta, Roo, and most modern Agent Skills adopters).
 */
type Target = Integration | "agents";

interface EditorSpec {
  /** Project-local directory that the editor scans for `<name>/SKILL.md`. */
  skillsRoot: string;
  /** Directory that signals "this editor is configured for this repo". */
  detectDir: string;
}

const EDITOR_PATHS: Record<Target, EditorSpec> = {
  agents:      { skillsRoot: ".agents/skills",      detectDir: ".agents"      },
  claude:      { skillsRoot: ".claude/skills",      detectDir: ".claude"      },
  copilot:     { skillsRoot: ".github/skills",      detectDir: ".github"      },
  cursor:      { skillsRoot: ".cursor/skills",      detectDir: ".cursor"      },
  gemini:      { skillsRoot: ".gemini/skills",      detectDir: ".gemini"      },
  opencode:    { skillsRoot: ".opencode/skills",    detectDir: ".opencode"    },
  antigravity: { skillsRoot: ".antigravity/skills", detectDir: ".antigravity" },
};

const ALL_EDITORS: Integration[] = ["claude", "copilot", "cursor", "gemini", "opencode", "antigravity"];

const SKILL_NAME = "git-impact";

// ─── Public API ───────────────────────────────────────────────────────────────

export interface InstallOptions {
  repoRoot: string;
  integrations: Integration[];
  context: RepoContext;
  silent?: boolean;
}

export interface RepoContext {
  companyDescription: string;
  managerPriorities: string;
  glossary: Record<string, string>;
}

export interface InstalledFile {
  path: string;
  action: "created" | "updated" | "skipped" | "removed";
}

/**
 * Core install function — idempotent, safe to run multiple times.
 *
 * Behaviour:
 *  1. Migrate away from pre-0.7 layout (deletes editor-specific instruction
 *     files that have been superseded by the canonical SKILL.md folder).
 *  2. Always write `.agents/skills/git-impact/` (cross-vendor standard).
 *  3. Mirror the same SKILL.md folder into each requested editor's path.
 *  4. Touch context.json, .gitignore, CLAUDE.md, manifest.json.
 */
export function install(opts: InstallOptions): InstalledFile[] {
  const { repoRoot, integrations, context } = opts;
  const installed: InstalledFile[] = [];

  // 0. Migrate any legacy per-editor instruction files from the old installer.
  installed.push(...migrateLegacyLayout(repoRoot));

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

  // 3. Install the SKILL.md folder once per requested editor. `agents` is
  //    always included as a cross-vendor baseline (covers Goose/Amp/Codex/
  //    Letta/Roo and most modern Agent Skills adopters).
  const targets: Target[] = dedupe(["agents", ...integrations]);
  for (const target of targets) {
    installed.push(...installSkillFolder(repoRoot, target));
  }

  // 4. Write CLAUDE.md when Claude Code is actually in scope. Detection
  //    matters because a Cursor-only user shouldn't get a top-level
  //    CLAUDE.md they didn't ask for; conversely, a user who later
  //    installs Claude Code should get the block on their next init
  //    even if `claude` wasn't passed explicitly.
  if (integrations.includes("claude") || fs.existsSync(path.join(repoRoot, ".claude"))) {
    installed.push(updateClaudeMd(repoRoot));
  }

  // 5. Write manifest
  const manifest = {
    version: "0.7.0",
    installedAt: new Date().toISOString(),
    integrations: targets,
    files: installed
      .filter((f) => f.action !== "removed")
      .map((f) => path.relative(repoRoot, f.path)),
  };
  const manifestPath = path.join(gitImpactDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  return installed;
}

// ─── Skill folder install ─────────────────────────────────────────────────────

function installSkillFolder(repoRoot: string, target: Target): InstalledFile[] {
  const spec = EDITOR_PATHS[target];
  const destDir = path.join(repoRoot, spec.skillsRoot, SKILL_NAME);
  // copyTree itself creates `destDir` recursively — no need to pre-create.
  return copyTree(shippedSkillDir(), destDir);
}

/** Recursively mirror `src` → `dest`. Returns one InstalledFile per file copied. */
function copyTree(src: string, dest: string): InstalledFile[] {
  const out: InstalledFile[] = [];
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      out.push(...copyTree(srcPath, destPath));
    } else if (entry.isFile()) {
      out.push(copyFile(srcPath, destPath));
    }
  }
  return out;
}

// ─── Legacy migration ─────────────────────────────────────────────────────────

/**
 * Files written by the pre-0.7 installer that are now superseded by the
 * canonical SKILL.md folder. Deleted on next `init`. Parent dirs are NOT
 * removed unless they were a git-impact-only location.
 */
const LEGACY_FILES = [
  ".github/instructions/git-impact.instructions.md",
  ".cursor/rules/git-impact.mdc",
  ".gemini/commands/git-impact.md",
];

function migrateLegacyLayout(repoRoot: string): InstalledFile[] {
  const removed: InstalledFile[] = [];
  for (const rel of LEGACY_FILES) {
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs)) {
      fs.unlinkSync(abs);
      removed.push({ path: abs, action: "removed" });
      // If the parent dir is now empty and was created solely for git-impact,
      // clean it up too. Only touch dirs ending in `instructions`, `rules`,
      // or `commands` — those are the pre-0.7 install locations.
      tryRemoveEmptyDir(path.dirname(abs), ["instructions", "rules", "commands"]);
    }
  }
  return removed;
}

function tryRemoveEmptyDir(dir: string, allowedBasenames: string[]): void {
  if (!allowedBasenames.includes(path.basename(dir))) return;
  try {
    const entries = fs.readdirSync(dir);
    if (entries.length === 0) fs.rmdirSync(dir);
  } catch {
    // Dir gone or not readable — nothing to do.
  }
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
    const updated = existing.slice(0, startIdx) + block + existing.slice(endIdx + BLOCK_END.length);
    fs.writeFileSync(claudeMdPath, updated);
    return { path: claudeMdPath, action: "updated" };
  }

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
 * already have config there, in catalog order. Lets `init` skip the "which AI
 * tools do you use?" question when the answer is obvious from the filesystem.
 *
 * Note: `agents` (the cross-vendor `.agents/skills/` baseline) is always
 * written by `install()` regardless of detection, so it's excluded from this
 * return value.
 */
export function detectEditors(repoRoot: string): Integration[] {
  return ALL_EDITORS.filter((id) => {
    const dir = EDITOR_PATHS[id].detectDir;
    return fs.existsSync(path.join(repoRoot, dir));
  });
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
    `  Options: ${ALL_EDITORS.join(", ")}\n` +
    `  (.agents/skills/ is always written — covers Goose, Amp, Codex, Letta, Roo)\n` +
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
  let integrations: Integration[];
  const raw = integrationsInput.toLowerCase().trim();
  if (!raw) {
    integrations = detected.length > 0 ? detected : ["claude"];
  } else if (raw === "all") {
    integrations = ALL_EDITORS;
  } else {
    const validIds = new Set<string>(ALL_EDITORS);
    integrations = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => validIds.has(s)) as Integration[];
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
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  return { path: destPath, action: existed ? "updated" : "created" };
}

function dedupe<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
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
