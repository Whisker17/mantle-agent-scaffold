import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("version consistency", () => {
    it("aligns package, docs, server, and cli versions", () => {
        const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
        const docsPackageJson = JSON.parse(readFileSync("docs/package.json", "utf8"));
        const server = readFileSync("src/server.ts", "utf8");
        const cli = readFileSync("cli/index.ts", "utf8");
        const docsIndex = readFileSync("docs/content/index.mdx", "utf8");
        const v = packageJson.version;
        // docs/package.json tracks the same version
        expect(docsPackageJson.version).toBe(v);
        // server and cli read version dynamically from package.json
        expect(server).toContain("version: pkg.version");
        expect(cli).toContain(".version(pkg.version)");
        // docs index references the current version
        expect(docsIndex).toContain(`v${v}`);
    });
});
