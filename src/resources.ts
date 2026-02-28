import { CHAIN_CONFIGS } from "./config/chains.js";
import { getRegistryData } from "./lib/registry.js";
import { MANTLE_TOKENS } from "./config/tokens.js";
import { MANTLE_PROTOCOLS } from "./config/protocols.js";
import type { Resource } from "./types.js";

const RESOURCES: Resource[] = [
  {
    uri: "mantle://chain/mainnet",
    name: "Mantle Mainnet Configuration",
    description: "Static chain configuration for Mantle mainnet.",
    mimeType: "application/json"
  },
  {
    uri: "mantle://chain/sepolia",
    name: "Mantle Sepolia Testnet Configuration",
    description: "Static chain configuration for Mantle Sepolia.",
    mimeType: "application/json"
  },
  {
    uri: "mantle://registry/contracts",
    name: "Mantle Verified Contract Registry",
    description: "Curated contract registry for address resolution workflows.",
    mimeType: "application/json"
  },
  {
    uri: "mantle://registry/tokens",
    name: "Mantle Token Registry",
    description: "Embedded quick-reference token list for Mantle networks.",
    mimeType: "application/json"
  },
  {
    uri: "mantle://registry/protocols",
    name: "Mantle DeFi Protocol Registry",
    description: "Protocol metadata for enabled and planned Mantle integrations.",
    mimeType: "application/json"
  }
];

export function listResources(): Resource[] {
  return RESOURCES;
}

export function readResource(uri: string): { content: string; mimeType: string } | null {
  if (uri === "mantle://chain/mainnet") {
    return {
      content: JSON.stringify(CHAIN_CONFIGS.mainnet, null, 2),
      mimeType: "application/json"
    };
  }

  if (uri === "mantle://chain/sepolia") {
    return {
      content: JSON.stringify(CHAIN_CONFIGS.sepolia, null, 2),
      mimeType: "application/json"
    };
  }

  if (uri === "mantle://registry/contracts") {
    return {
      content: JSON.stringify(getRegistryData(), null, 2),
      mimeType: "application/json"
    };
  }

  if (uri === "mantle://registry/tokens") {
    return {
      content: JSON.stringify(MANTLE_TOKENS, null, 2),
      mimeType: "application/json"
    };
  }

  if (uri === "mantle://registry/protocols") {
    return {
      content: JSON.stringify(MANTLE_PROTOCOLS, null, 2),
      mimeType: "application/json"
    };
  }

  return null;
}

export async function prefetchResources(): Promise<void> {
  return Promise.resolve();
}
