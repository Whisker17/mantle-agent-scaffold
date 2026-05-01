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
    expect(existsSync(".github/scripts/render-shared-prompt.py")).toBe(true);

    const workflow = readFileSync(".github/workflows/ai-review.yml", "utf8");
    expect(workflow).toContain("MANTLE_PROMPTS_REPOSITORY: Whisker17/mantle-prompts");
    expect(workflow).toContain("MANTLE_PROMPTS_PROFILE: profiles/repositories/Whisker17/mantle-agent-scaffold.json");
    expect(workflow).toContain("repository: ${{ env.MANTLE_PROMPTS_REPOSITORY }}");
    expect(workflow).toContain(".github/scripts/render-shared-prompt.py");
    expect(workflow).toContain("prompts/adversarial-review/codex-initial-review.md");
    expect(workflow).toContain("prompts/adversarial-review/claude-second-pass-review.md");
    expect(workflow).toContain("prompts/adversarial-review/codex-final-review.md");
    expect(workflow).not.toContain("MANTLE_PROMPTS_VERSION");
    expect(workflow).not.toContain("prompts/pr/adversarial-review/");
    expect(workflow).not.toContain("prompts/pr/adversarial-review/v1/");
    expect(workflow).not.toContain("cat .github/prompts/");
    expect(workflow).not.toContain("__PR_NUMBER__");
    expect(workflow).not.toContain("__REPO__");
  });
});
