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
 * Every editor we know how to install for, with the project-local directory
 * it reads SKILL.md folders from (per each vendor's published Agent Skills
 * docs as of 2026-05). Adding a new editor here is a one-line change.
 *
 * `agents` is the cross-vendor standard path (`.agents/skills/`) — most
 * modern Agent Skills adopters read it, so it's always written as a
 * baseline.
 */
export type Integration =
  | "agents"
  | "claude"
  | "copilot"
  | "cursor"
  | "gemini"
  | "opencode"
  | "goose"
  | "amp"
  | "codex"
  | "kiro"
  | "roo"
  | "factory";

interface EditorSpec {
  /** Project-local directory that the editor scans for `<name>/SKILL.md`. */
  skillsRoot: string;
  /** Directory that signals "this editor is configured for this repo". */
  detectDir: string;
}

const EDITORS: Record<Integration, EditorSpec> = {
  agents:   { skillsRoot: ".agents/skills",   detectDir: ".agents"   },
  claude:   { skillsRoot: ".claude/skills",   detectDir: ".claude"   },
  copilot:  { skillsRoot: ".github/skills",   detectDir: ".github"   },
  cursor:   { skillsRoot: ".cursor/skills",   detectDir: ".cursor"   },
  gemini:   { skillsRoot: ".gemini/skills",   detectDir: ".gemini"   },
  opencode: { skillsRoot: ".opencode/skills", detectDir: ".opencode" },
  goose:    { skillsRoot: ".goose/skills",    detectDir: ".goose"    },
  amp:      { skillsRoot: ".amp/skills",      detectDir: ".amp"      },
  codex:    { skillsRoot: ".codex/skills",    detectDir: ".codex"    },
  kiro:     { skillsRoot: ".kiro/skills",     detectDir: ".kiro"     },
  roo:      { skillsRoot: ".roo/skills",      detectDir: ".roo"      },
  factory:  { skillsRoot: ".factory/skills",  detectDir: ".factory"  },
};

const ALL_INTEGRATIONS: Integration[] = Object.keys(EDITORS) as Integration[];

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
  //    always included as a cross-vendor baseline.
  const targets = dedupe(["agents", ...integrations] as Integration[]);
  for (const integration of targets) {
    installed.push(...installSkillFolder(repoRoot, integration));
  }

  // 4. Always write CLAUDE.md — it's the most-used editor's discovery
  //    surface, and the block is harmless for non-Claude users.
  installed.push(updateClaudeMd(repoRoot));

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

function installSkillFolder(repoRoot: string, integration: Integration): InstalledFile[] {
  const spec = EDITORS[integration];
  const destDir = path.join(repoRoot, spec.skillsRoot, SKILL_NAME);
  fs.mkdirSync(destDir, { recursive: true });

  const src = shippedSkillDir();
  return copyTree(src, destDir);
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
  return ALL_INTEGRATIONS.filter((id) => {
    if (id === "agents") return false;
    const dir = EDITORS[id].detectDir;
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
  const editorOptions = ALL_INTEGRATIONS.filter((i) => i !== "agents");
  const detectedLabel =
    detected.length > 0
      ? detected.join(", ")
      : "none detected — defaulting to claude";

  const integrationsInput = await ask(
    `\n  Which AI editors should I install for? (comma-separated, or "all")\n` +
    `  Options: ${editorOptions.join(", ")}\n` +
    `  (.agents/skills/ is always written — works with most modern editors)\n` +
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
    integrations = editorOptions;
  } else {
    integrations = raw
      .split(",")
      .map((s) => s.trim() as Integration)
      .filter((s) => ALL_INTEGRATIONS.includes(s) && s !== "agents");
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
