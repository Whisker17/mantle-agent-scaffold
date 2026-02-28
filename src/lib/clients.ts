import { createPublicClient, http } from "viem";
import type { Network } from "../types.js";
import { CHAIN_CONFIGS } from "../config/chains.js";

const clientCache = new Map<Network, ReturnType<typeof createPublicClient>>();

export function getRpcUrl(network: Network): string {
  if (network === "mainnet") {
    return process.env.MANTLE_RPC_URL ?? CHAIN_CONFIGS.mainnet.rpc_url;
  }
  return process.env.MANTLE_SEPOLIA_RPC_URL ?? CHAIN_CONFIGS.sepolia.rpc_url;
}

export function getPublicClient(network: Network): ReturnType<typeof createPublicClient> {
  const cached = clientCache.get(network);
  if (cached) {
    return cached;
  }

  const client = createPublicClient({
    transport: http(getRpcUrl(network))
  });
  clientCache.set(network, client);
  return client;
}
