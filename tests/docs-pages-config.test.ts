import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("docs pages configuration", () => {
  it("uses mantle-xyz repository URLs throughout the docs site metadata", () => {
    const readme = readFileSync("README.md", "utf8");
    const layout = readFileSync("docs/app/layout.tsx", "utf8");
    const themeConfig = readFileSync("docs/theme.config.tsx", "utf8");

    expect(readme).toContain("https://mantle-xyz.github.io/mantle-agent-scaffold/");
    expect(layout).toContain("https://mantle-xyz.github.io/mantle-agent-scaffold");
    expect(themeConfig).toContain("https://github.com/mantle-xyz/mantle-agent-scaffold");
    expect(themeConfig).toContain("https://github.com/mantle-xyz/mantle-agent-scaffold/tree/main/docs");
  });

  it("documents and supports GitHub Pages enablement for the org repository", () => {
    const readme = readFileSync("README.md", "utf8");
    const workflow = readFileSync(".github/workflows/docs-pages.yml", "utf8");

    expect(readme).toContain("PAGES_ENABLEMENT_TOKEN");
    expect(readme).toContain("GitHub Actions");
    expect(workflow).toContain("PAGES_ENABLEMENT_TOKEN");
    expect(workflow).toContain("enablement: true");
  });
});
