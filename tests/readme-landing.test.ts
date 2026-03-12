import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("readme landing page", () => {
  it("keeps the root README short and integration-focused", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("# mantle-agent-scaffold");
    expect(readme).toContain("## Quick Start");
    expect(readme).toContain("## Use The Skills Checkout");
    expect(readme).toContain("## Minimal MCP Client Config");
    expect(readme).toContain("## Verify");
    expect(readme).toContain("## Documentation");

    expect(readme).not.toContain("## Implemented Surface");
    expect(readme).not.toContain("## DeFi Data Source Strategy");
    expect(readme).not.toContain("## External Agents: Required Usage Contract");
    expect(readme).not.toContain("## URL and Interface Quick Reference");
    expect(readme).not.toContain("## E2E Agent Test");
  });

  it("points readers to the docs site for detailed guidance", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("/concepts");
    expect(readme).toContain("/concepts/skills");
    expect(readme).toContain("/concepts/external-agents");
    expect(readme).toContain("/concepts/testing");
    expect(readme).toContain("https://mantle-xyz.github.io/mantle-agent-scaffold/");
  });
});
