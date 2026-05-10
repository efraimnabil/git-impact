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

  it("finds multiple editors in stable order", () => {
    fs.mkdirSync(path.join(tmp, ".cursor"));
    fs.mkdirSync(path.join(tmp, ".gemini"));
    fs.mkdirSync(path.join(tmp, ".claude"));
    expect(detectEditors(tmp)).toEqual(["claude", "cursor", "gemini"]);
  });

  it("treats .github as copilot", () => {
    fs.mkdirSync(path.join(tmp, ".github"));
    expect(detectEditors(tmp)).toEqual(["copilot"]);
  });
});

describe("install", () => {
  it("writes context.json, gitignore, and CLAUDE.md for claude integration", () => {
    install({
      repoRoot: tmp,
      integrations: ["claude"],
      context: {
        companyDescription: "X",
        managerPriorities: "Y",
        glossary: {},
      },
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

    const skillContent = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf-8");
    expect(skillContent).toContain("name: git-impact");
    expect(skillContent).toContain("provenance");
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

  it("writes editor-specific files when their integration is requested", () => {
    install({
      repoRoot: tmp,
      integrations: ["claude", "copilot", "cursor", "gemini"],
      context: { companyDescription: "X", managerPriorities: "Y", glossary: {} },
      silent: true,
    });
    expect(fs.existsSync(path.join(tmp, ".github", "instructions", "git-impact.instructions.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, ".cursor", "rules", "git-impact.mdc"))).toBe(true);
    expect(fs.existsSync(path.join(tmp, ".gemini", "commands", "git-impact.md"))).toBe(true);
  });
});
