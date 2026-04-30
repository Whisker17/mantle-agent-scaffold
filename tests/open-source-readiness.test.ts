import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("open source readiness", () => {
  it("includes baseline community health files", () => {
    const expectedFiles = [
      "CONTRIBUTING.md",
      "CODE_OF_CONDUCT.md",
      "SECURITY.md",
      "SUPPORT.md",
      ".github/pull_request_template.md",
      ".github/ISSUE_TEMPLATE/bug_report.md",
      ".github/ISSUE_TEMPLATE/feature_request.md"
    ];

    for (const file of expectedFiles) {
      expect(existsSync(file), `${file} should exist`).toBe(true);
    }
  });

  it("includes ci workflow for build, tests, docs, and skills init", () => {
    expect(existsSync(".github/workflows/ci.yml")).toBe(true);

    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("git submodule update --init --recursive skills");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm run docs:build");
  });

  it("loads AI review prompts from the shared prompt repository", () => {
    expect(existsSync(".github/workflows/ai-review.yml")).toBe(true);

    const workflow = readFileSync(".github/workflows/ai-review.yml", "utf8");
    expect(workflow).toContain("MANTLE_PROMPTS_REPOSITORY: Whisker17/mantle-prompts");
    expect(workflow).toContain("repository: ${{ env.MANTLE_PROMPTS_REPOSITORY }}");
    expect(workflow).toContain("prompts/pr/adversarial-review/v1/codex-initial-review.md");
    expect(workflow).toContain("prompts/pr/adversarial-review/v1/claude-second-pass-review.md");
    expect(workflow).toContain("prompts/pr/adversarial-review/v1/codex-final-review.md");
    expect(workflow).not.toContain("cat .github/prompts/");
  });
});
