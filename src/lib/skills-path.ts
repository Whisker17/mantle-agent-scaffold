import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function readSkillsReference(relativePath: string, baseDir = process.cwd()): string {
  const absolutePath = path.resolve(baseDir, relativePath);

  if (existsSync(absolutePath)) {
    return readFileSync(absolutePath, "utf8");
  }

  const skillsRoot = path.resolve(baseDir, "skills");
  const nestedSkillsPath = path.resolve(baseDir, "skills", relativePath);

  if (existsSync(nestedSkillsPath)) {
    return readFileSync(nestedSkillsPath, "utf8");
  }

  if (!existsSync(skillsRoot)) {
    throw new Error(
      `Missing skills checkout at ${skillsRoot}. Run \`npm run skills:init\` to initialize the mantle-skills submodule.`
    );
  }

  throw new Error(`Missing skills reference file: ${relativePath}`);
}
