import nextra from "nextra";
import { fileURLToPath } from "node:url";

const withNextra = nextra({
  search: {
    codeblocks: false
  }
});
const docsRoot = fileURLToPath(new URL(".", import.meta.url));

const isGithubActions = process.env.GITHUB_ACTIONS === "true";
const repository = process.env.GITHUB_REPOSITORY ?? "";
const repositoryName = repository.includes("/") ? repository.split("/")[1] : "";
const basePath = isGithubActions && repositoryName ? `/${repositoryName}` : "";

export default withNextra({
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  turbopack: {
    root: docsRoot
  },
  ...(basePath
    ? {
        basePath,
        assetPrefix: basePath
      }
    : {})
});
