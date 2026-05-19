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

  it("detects the modern Agent Skills adopters", () => {
    fs.mkdirSync(path.join(tmp, ".opencode"));
    fs.mkdirSync(path.join(tmp, ".codex"));
    fs.mkdirSync(path.join(tmp, ".kiro"));
    fs.mkdirSync(path.join(tmp, ".roo"));
    expect(detectEditors(tmp)).toEqual(["opencode", "codex", "kiro", "roo"]);
  });

  it("never returns `agents` (it's always written as a baseline)", () => {
    fs.mkdirSync(path.join(tmp, ".agents"));
    expect(detectEditors(tmp)).not.toContain("agents");
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
      integrations: ["claude", "copilot", "cursor", "gemini", "opencode", "codex", "kiro", "roo", "factory"],
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
    expect(fs.existsSync(skill(".codex/skills"))).toBe(true);
    expect(fs.existsSync(skill(".kiro/skills"))).toBe(true);
    expect(fs.existsSync(skill(".roo/skills"))).toBe(true);
    expect(fs.existsSync(skill(".factory/skills"))).toBe(true);
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
});
