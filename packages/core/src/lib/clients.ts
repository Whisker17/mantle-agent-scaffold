import { createPublicClient, http, fallback, defineChain } from "viem";
import type { Network } from "../types.js";
import { CHAIN_CONFIGS } from "../config/chains.js";

/**
 * Mantle chain definitions for viem — needed for multicall support.
 * multicall3 is deployed at the canonical address on both networks.
 */
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

const mantleMainnet = defineChain({
  id: 5000,
  name: "Mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mantle.xyz/"] } },
  contracts: { multicall3: { address: MULTICALL3_ADDRESS } }
});

const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.mantle.xyz:13000/"] } },
  contracts: { multicall3: { address: MULTICALL3_ADDRESS } }
});

const clientCache = new Map<Network, ReturnType<typeof createPublicClient>>();

const HTTP_TRANSPORT_CONFIG = {
  retryCount: 3,
  retryDelay: 150,
  timeout: 20_000,
} as const;

export function getRpcUrl(network: Network): string {
  if (network === "mainnet") {
    return process.env.MANTLE_RPC_URL ?? CHAIN_CONFIGS.mainnet.rpc_url;
  }
  return process.env.MANTLE_SEPOLIA_RPC_URL ?? CHAIN_CONFIGS.sepolia.rpc_url;
}

/**
 * Returns the list of RPC URLs to use for a given network.
 * When the user has set a custom RPC via env var, only that endpoint is used
 * (no public fallbacks appended) to avoid leaking requests across trust boundaries.
 */
export function getRpcUrls(network: Network): string[] {
  const envOverride = network === "mainnet"
    ? process.env.MANTLE_RPC_URL
    : process.env.MANTLE_SEPOLIA_RPC_URL;

  if (envOverride) {
    return [envOverride];
  }

  const primary = CHAIN_CONFIGS[network].rpc_url;
  const fallbacks = CHAIN_CONFIGS[network].fallback_rpc_urls ?? [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const url of [primary, ...fallbacks]) {
    const normalized = url.replace(/\/+$/, "");
    if (!seen.has(normalized)) {
      seen.add(normalized);
      urls.push(url);
    }
  }
  return urls;
}

export function getPublicClient(network: Network): ReturnType<typeof createPublicClient> {
  const cached = clientCache.get(network);
  if (cached) {
    return cached;
  }

  const urls = getRpcUrls(network);
  const transports = urls.map((url) => http(url, HTTP_TRANSPORT_CONFIG));

  const client = createPublicClient({
    chain: network === "mainnet" ? mantleMainnet : mantleSepolia,
    transport: transports.length > 1
      ? fallback(transports, { retryCount: 0 })
      : transports[0],
  });
  clientCache.set(network, client);
  return client;
}
