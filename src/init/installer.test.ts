import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { install, detectEditors } from "./installer";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "git-impact-installer-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("detectEditors", () => {
  it("returns empty when no editor dirs exist", () => {
    expect(detectEditors(tmp)).toEqual([]);
  });

  it("finds .claude as claude", () => {
    fs.mkdirSync(path.join(tmp, ".claude"));
    expect(detectEditors(tmp)).toContain("claude");
  });

  it("finds multiple editors in catalog order", () => {
    fs.mkdirSync(path.join(tmp, ".cursor"));
    fs.mkdirSync(path.join(tmp, ".gemini"));
    fs.mkdirSync(path.join(tmp, ".claude"));
    expect(detectEditors(tmp)).toEqual(["claude", "cursor", "gemini"]);
  });

  it("treats .github as copilot", () => {
    fs.mkdirSync(path.join(tmp, ".github"));
    expect(detectEditors(tmp)).toEqual(["copilot"]);
  });

  it("detects OpenCode", () => {
    fs.mkdirSync(path.join(tmp, ".opencode"));
    expect(detectEditors(tmp)).toEqual(["opencode"]);
  });

  it("never returns `agents` (it's always written as a baseline, not user-selectable)", () => {
    fs.mkdirSync(path.join(tmp, ".agents"));
    // `agents` is not part of the public Integration type, so detection
    // must not surface it as an editor to install for.
    expect(detectEditors(tmp) as readonly string[]).not.toContain("agents");
  });
});

describe("install — canonical SKILL.md layout", () => {
  it("always writes the .agents/skills/git-impact/ baseline", () => {
    install({
      repoRoot: tmp,
      integrations: ["claude"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });
    expect(fs.existsSync(path.join(tmp, ".agents", "skills", "git-impact", "SKILL.md"))).toBe(true);
  });

  it("writes context.json, .gitignore, and CLAUDE.md for claude integration", () => {
    install({
      repoRoot: tmp,
      integrations: ["claude"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });
    expect(fs.existsSync(path.join(tmp, ".git-impact", "context.json"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, ".gitignore"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, "CLAUDE.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, ".claude", "skills", "git-impact", "SKILL.md"))).toBe(true);
  });

  it("copies SKILL.md and references/ from the shipped skill directory", () => {
    install({
      repoRoot: tmp,
      integrations: ["claude"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });
    const skillDir = path.join(tmp, ".claude", "skills", "git-impact");
    expect(fs.existsSync(path.join(skillDir, "references", "translation-rules.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillDir, "references", "html-template.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillDir, "references", "mode-standup.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillDir, "references", "mode-review.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillDir, "references", "mode-init.md"))).toBe(true);

    const skillContent = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf-8");
    expect(skillContent).toContain("name: git-impact");
    expect(skillContent).toContain("references/mode-standup.md");
  });

  it("is idempotent — running twice does not duplicate gitignore entries", () => {
    install({
      repoRoot: tmp,
      integrations: ["claude"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });
    install({
      repoRoot: tmp,
      integrations: ["claude"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });
    const gitignore = fs.readFileSync(path.join(tmp, ".gitignore"), "utf-8");
    const matches = gitignore.match(/\.git-impact\/history\.db/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("writes SKILL.md to every requested editor's project-local skills root", () => {
    install({
      repoRoot: tmp,
      integrations: ["claude", "copilot", "cursor", "gemini", "opencode"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });
    const skill = (p: string) => path.join(tmp, p, "git-impact", "SKILL.md");
    expect(fs.existsSync(skill(".agents/skills"))).toBe(true);
    expect(fs.existsSync(skill(".claude/skills"))).toBe(true);
    expect(fs.existsSync(skill(".github/skills"))).toBe(true);
    expect(fs.existsSync(skill(".cursor/skills"))).toBe(true);
    expect(fs.existsSync(skill(".gemini/skills"))).toBe(true);
    expect(fs.existsSync(skill(".opencode/skills"))).toBe(true);
  });

  it("never writes the legacy per-editor instruction files", () => {
    install({
      repoRoot: tmp,
      integrations: ["claude", "copilot", "cursor", "gemini"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });
    expect(fs.existsSync(path.join(tmp, ".github", "instructions", "git-impact.instructions.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmp, ".cursor", "rules", "git-impact.mdc"))).toBe(false);
    expect(fs.existsSync(path.join(tmp, ".gemini", "commands", "git-impact.md"))).toBe(false);
  });
});

describe("install — legacy migration", () => {
  it("removes pre-0.7 per-editor instruction files when present", () => {
    fs.mkdirSync(path.join(tmp, ".github", "instructions"), { recursive: true });
    fs.mkdirSync(path.join(tmp, ".cursor", "rules"), { recursive: true });
    fs.mkdirSync(path.join(tmp, ".gemini", "commands"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".github", "instructions", "git-impact.instructions.md"), "legacy");
    fs.writeFileSync(path.join(tmp, ".cursor", "rules", "git-impact.mdc"), "legacy");
    fs.writeFileSync(path.join(tmp, ".gemini", "commands", "git-impact.md"), "legacy");

    const result = install({
      repoRoot: tmp,
      integrations: ["claude"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });

    expect(fs.existsSync(path.join(tmp, ".github", "instructions", "git-impact.instructions.md"))).toBe(false);
    expect(fs.existsSync(path.join(tmp, ".cursor", "rules", "git-impact.mdc"))).toBe(false);
    expect(fs.existsSync(path.join(tmp, ".gemini", "commands", "git-impact.md"))).toBe(false);

    const removed = result.filter((r) => r.action === "removed");
    expect(removed).toHaveLength(3);
  });

  it("removes the now-empty parent dirs after migration", () => {
    fs.mkdirSync(path.join(tmp, ".cursor", "rules"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".cursor", "rules", "git-impact.mdc"), "legacy");

    install({
      repoRoot: tmp,
      integrations: ["claude"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });

    expect(fs.existsSync(path.join(tmp, ".cursor", "rules"))).toBe(false);
  });

  it("leaves sibling files in the legacy dirs alone", () => {
    fs.mkdirSync(path.join(tmp, ".github", "instructions"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".github", "instructions", "git-impact.instructions.md"), "legacy");
    fs.writeFileSync(path.join(tmp, ".github", "instructions", "other.md"), "keep me");

    install({
      repoRoot: tmp,
      integrations: ["claude"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });

    expect(fs.existsSync(path.join(tmp, ".github", "instructions", "other.md"))).toBe(true);
  });

  it("is a no-op when no legacy files are present", () => {
    const result = install({
      repoRoot: tmp,
      integrations: ["claude"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });
    const removed = result.filter((r) => r.action === "removed");
    expect(removed).toHaveLength(0);
  });

  it("runs migration BEFORE the install step (so legacy files can't shadow new ones)", () => {
    fs.mkdirSync(path.join(tmp, ".github", "instructions"), { recursive: true });
    fs.writeFileSync(path.join(tmp, ".github", "instructions", "git-impact.instructions.md"), "legacy");

    const result = install({
      repoRoot: tmp,
      integrations: ["claude"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });

    // The InstalledFile[] array preserves operation order. A `removed`
    // entry must appear BEFORE any `created` entry under a SKILL.md path.
    const indexOfFirstRemove  = result.findIndex((r) => r.action === "removed");
    const indexOfFirstCreate  = result.findIndex((r) => r.action === "created" && r.path.includes("SKILL.md"));
    expect(indexOfFirstRemove).toBeGreaterThan(-1);
    expect(indexOfFirstCreate).toBeGreaterThan(-1);
    expect(indexOfFirstRemove).toBeLessThan(indexOfFirstCreate);
  });
});

describe("install — CLAUDE.md guard", () => {
  it("writes CLAUDE.md when `claude` is in integrations", () => {
    install({
      repoRoot: tmp,
      integrations: ["claude"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });
    expect(fs.existsSync(path.join(tmp, "CLAUDE.md"))).toBe(true);
  });

  it("does NOT write CLAUDE.md for non-Claude integrations on a fresh repo", () => {
    install({
      repoRoot: tmp,
      integrations: ["cursor"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });
    expect(fs.existsSync(path.join(tmp, "CLAUDE.md"))).toBe(false);
  });

  it("DOES write CLAUDE.md for a non-claude integration when `.claude/` already exists", () => {
    // A user who already has Claude Code configured (even though they're
    // running init for a different editor today) should still get the
    // CLAUDE.md block so Claude Code can find the skill later.
    fs.mkdirSync(path.join(tmp, ".claude"));
    install({
      repoRoot: tmp,
      integrations: ["cursor"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });
    expect(fs.existsSync(path.join(tmp, "CLAUDE.md"))).toBe(true);
  });
});

describe("SKILL.md frontmatter — strict-editor compatibility", () => {
  it("description fits within OpenCode's 1024-char cap", () => {
    install({
      repoRoot: tmp,
      integrations: ["claude"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });
    const content = fs.readFileSync(
      path.join(tmp, ".claude", "skills", "git-impact", "SKILL.md"),
      "utf-8"
    );
    const m = content.match(/description:\s*>\s*\n([\s\S]+?)\n---/);
    expect(m, "description block not found in SKILL.md frontmatter").toBeTruthy();
    const desc = m![1].replace(/\s+/g, " ").trim();
    // OpenCode caps description at 1024 chars per their published Agent
    // Skills docs. GitHub Copilot's name regex is strict but doesn't cap
    // description — OpenCode is the tightest constraint.
    expect(desc.length).toBeLessThanOrEqual(1024);
  });

  it("name matches the strict regex used by OpenCode + GitHub Copilot", () => {
    install({
      repoRoot: tmp,
      integrations: ["claude"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });
    const content = fs.readFileSync(
      path.join(tmp, ".claude", "skills", "git-impact", "SKILL.md"),
      "utf-8"
    );
    const m = content.match(/^name:\s*(\S+)/m);
    expect(m).toBeTruthy();
    // lowercase letters/digits/hyphens, ≤64 chars, no leading/trailing/
    // consecutive hyphens. Anything else and Copilot silently fails to
    // register the skill.
    expect(m![1]).toMatch(/^[a-z0-9](?!.*--)[a-z0-9-]{0,62}[a-z0-9]$/);
  });
});
