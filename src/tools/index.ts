import { accountTools } from "./account.js";
import { chainTools } from "./chain.js";
import { registryTools } from "./registry.js";
import { tokenTools } from "./token.js";
import type { Tool } from "../types.js";

export { accountTools } from "./account.js";
export { chainTools } from "./chain.js";
export { registryTools } from "./registry.js";
export { tokenTools } from "./token.js";

const toolList = [
  ...Object.values(chainTools),
  ...Object.values(registryTools),
  ...Object.values(accountTools),
  ...Object.values(tokenTools)
];

export const allTools: Record<string, Tool> = Object.fromEntries(
  toolList.map((tool) => [tool.name, tool] as const)
);
