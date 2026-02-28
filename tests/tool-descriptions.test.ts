import { describe, expect, it } from "vitest";
import { allTools } from "../src/tools/index.js";

describe("tool descriptions", () => {
  it("includes concrete Examples in every v0.1 tool description", () => {
    const tools = Object.values(allTools);
    for (const tool of tools) {
      expect(tool.description).toContain("Examples:");
      expect(tool.description).toMatch(/0x[a-fA-F0-9]{8}/);
    }
  });
});
