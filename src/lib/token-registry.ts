import { getAddress, isAddress } from "viem";
import { MantleMcpError } from "../errors.js";
import { MANTLE_TOKENS, type TokenEntry } from "../config/tokens.js";
import type { Network } from "../types.js";

export interface ResolvedTokenInput {
  address: string;
  symbol: string | null;
  decimals: number | null;
  name?: string | null;
}

function findByAddress(network: Network, address: string): TokenEntry | null {
  const wanted = getAddress(address);
  const entries = Object.values(MANTLE_TOKENS[network]);
  for (const entry of entries) {
    if (entry.address !== "native" && getAddress(entry.address) === wanted) {
      return entry;
    }
  }
  return null;
}

function findBySymbol(network: Network, symbol: string): TokenEntry | null {
  const key = Object.keys(MANTLE_TOKENS[network]).find(
    (candidate) => candidate.toLowerCase() === symbol.toLowerCase()
  );
  return key ? MANTLE_TOKENS[network][key] : null;
}

export function resolveTokenInput(identifier: string, network: Network): ResolvedTokenInput {
  if (isAddress(identifier, { strict: false })) {
    const checksummed = getAddress(identifier);
    const entry = findByAddress(network, checksummed);
    return {
      address: checksummed,
      symbol: entry?.symbol ?? null,
      decimals: entry?.decimals ?? null,
      name: entry?.name ?? null
    };
  }

  const entry = findBySymbol(network, identifier);
  if (!entry) {
    throw new MantleMcpError(
      "TOKEN_NOT_FOUND",
      `Unknown token: ${identifier}`,
      "Use a known token symbol from mantle://registry/tokens or provide a token address.",
      { token: identifier, network }
    );
  }

  return {
    address: entry.address,
    symbol: entry.symbol,
    decimals: entry.decimals,
    name: entry.name
  };
}

export function findTokenBySymbol(network: Network, symbol: string): TokenEntry | null {
  return findBySymbol(network, symbol);
}
