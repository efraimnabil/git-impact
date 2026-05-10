import { describe, it, expect } from "vitest";
import { redactFilename, redactText } from "./redact";

describe("redactFilename — defaults", () => {
  const cases: Array<[string, "redacted" | "kept"]> = [
    [".env", "redacted"],
    [".env.local", "redacted"],
    [".env.production", "redacted"],
    ["src/.env.staging", "redacted"],
    [".npmrc", "redacted"],
    [".aws/credentials", "redacted"],
    [".ssh/id_rsa", "redacted"],
    ["config/credentials.yml", "redacted"],
    ["lib/secret-helper.ts", "redacted"],
    ["certs/tls.pem", "redacted"],
    ["keys/server.key", "redacted"],
    // benign — should pass through
    ["src/index.ts", "kept"],
    ["README.md", "kept"],
    ["package.json", "kept"],
    ["src/utils/helpers.ts", "kept"],
    ["docs/architecture.md", "kept"],
  ];

  for (const [file, expected] of cases) {
    it(`${expected === "redacted" ? "redacts" : "keeps"} ${file}`, () => {
      const out = redactFilename(file);
      if (expected === "redacted") {
        expect(out).toBe("[redacted-secret-file]");
      } else {
        expect(out).toBe(file);
      }
    });
  }

  it("respects enabled: false", () => {
    expect(redactFilename(".env", { enabled: false })).toBe(".env");
  });

  it("supports user-supplied glob patterns", () => {
    expect(
      redactFilename("config/internal-only.yml", {
        enabled: true,
        filePatterns: ["*internal*"],
      })
    ).toBe("[redacted-secret-file]");
  });
});

describe("redactText — defaults", () => {
  it("redacts Stripe live keys", () => {
    const out = redactText("token sk_live_abcdef0123456789xyz123 was leaked");
    expect(out).toContain("[redacted-secret]");
    expect(out).not.toContain("sk_live_");
  });

  it("redacts AWS access key ids", () => {
    expect(redactText("AKIAIOSFODNN7EXAMPLE used")).toBe("[redacted-secret] used");
  });

  it("redacts GitHub PATs", () => {
    const out = redactText("ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa pushed");
    expect(out).toContain("[redacted-secret]");
  });

  it("redacts JWT-shaped strings", () => {
    const out = redactText(
      "header eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcDEF received"
    );
    expect(out).toContain("[redacted-secret]");
  });

  it("respects enabled: false", () => {
    expect(redactText("ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", { enabled: false }))
      .toBe("ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("preserves benign text", () => {
    const benign = "Refactored auth middleware to support multi-tenant queries.";
    expect(redactText(benign)).toBe(benign);
  });
});
