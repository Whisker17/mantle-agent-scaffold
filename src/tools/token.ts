import { formatUnits } from "viem";
import { MantleMcpError } from "../errors.js";
import { getPublicClient } from "../lib/clients.js";
import { ERC20_ABI } from "../lib/erc20.js";
import { normalizeNetwork } from "../lib/network.js";
import { fetchTokenListSnapshot, type TokenListSnapshot } from "../lib/token-list.js";
import {
  findTokenBySymbol,
  resolveTokenInput as resolveTokenFromQuickRef,
  type ResolvedTokenInput
} from "../lib/token-registry.js";
import { CHAIN_CONFIGS } from "../config/chains.js";
import type { Tool } from "../types.js";

interface TokenDeps {
  getClient: (network: "mainnet" | "sepolia") => any;
  now: () => string;
  resolveTokenInput: (
    token: string,
    network?: "mainnet" | "sepolia"
  ) => Promise<ResolvedTokenInput> | ResolvedTokenInput;
  readTokenMetadata: (
    client: any,
    tokenAddress: string
  ) => Promise<{ name: string | null; symbol: string | null; decimals: number | null; totalSupply: bigint | null }>;
  fetchTokenListSnapshot: () => Promise<TokenListSnapshot>;
}

const defaultDeps: TokenDeps = {
  getClient: getPublicClient,
  now: () => new Date().toISOString(),
  resolveTokenInput: (token, network) => resolveTokenFromQuickRef(token, network ?? "mainnet"),
  readTokenMetadata: async (client, tokenAddress) => {
    const read = async <T>(functionName: string): Promise<T | null> => {
      if (!client.readContract) {
        return null;
      }
      try {
        return (await client.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: functionName as never
        })) as T;
      } catch {
        return null;
      }
    };

    const [name, symbol, decimals, totalSupply] = await Promise.all([
      read<string>("name"),
      read<string>("symbol"),
      read<number>("decimals"),
      read<bigint>("totalSupply")
    ]);

    return { name, symbol, decimals, totalSupply };
  },
  fetchTokenListSnapshot
};

function withDeps(overrides?: Partial<TokenDeps>): TokenDeps {
  return {
    ...defaultDeps,
    ...overrides
  };
}

function findTokenInCanonical(
  snapshot: TokenListSnapshot,
  symbol: string,
  chainId: number
): { address: string; decimals: number } | null {
  const match = snapshot.tokens.find(
    (token) => token.chainId === chainId && token.symbol.toLowerCase() === symbol.toLowerCase()
  );
  if (!match) {
    return null;
  }
  return { address: match.address, decimals: match.decimals };
}

export async function getTokenInfo(
  args: Record<string, unknown>,
  deps?: Partial<TokenDeps>
): Promise<any> {
  const resolvedDeps = withDeps(deps);
  const { network } = normalizeNetwork(args);
  const tokenInput = typeof args.token === "string" ? args.token : "";
  const resolved = await resolvedDeps.resolveTokenInput(tokenInput, network);
  const client = resolvedDeps.getClient(network);

  if (resolved.address === "native") {
    return {
      address: "native",
      name: "Mantle",
      symbol: "MNT",
      decimals: 18,
      total_supply_raw: null,
      total_supply_normalized: null,
      network,
      collected_at_utc: resolvedDeps.now()
    };
  }

  const metadata = await resolvedDeps.readTokenMetadata(client, resolved.address);
  return {
    address: resolved.address,
    name: metadata.name,
    symbol: metadata.symbol ?? resolved.symbol,
    decimals: metadata.decimals ?? resolved.decimals,
    total_supply_raw: metadata.totalSupply?.toString() ?? null,
    total_supply_normalized:
      metadata.totalSupply != null && metadata.decimals != null
        ? formatUnits(metadata.totalSupply, metadata.decimals)
        : null,
    network,
    collected_at_utc: resolvedDeps.now()
  };
}

export async function getTokenPrices(args: Record<string, unknown>): Promise<any> {
  const { network } = normalizeNetwork(args);
  const baseCurrency =
    typeof args.base_currency === "string" && args.base_currency.toLowerCase() === "mnt"
      ? "mnt"
      : "usd";
  const tokens = Array.isArray(args.tokens) ? args.tokens.map(String) : [];
  if (tokens.length === 0) {
    throw new MantleMcpError(
      "INVALID_INPUT",
      "At least one token is required.",
      "Provide one or more token symbols or addresses in `tokens`.",
      { field: "tokens" }
    );
  }

  const prices = tokens.map((input) => ({
    input,
    symbol: null,
    address: null,
    price: null,
    source: "none" as const,
    confidence: "low" as const,
    quoted_at_utc: null,
    warnings: ["No trusted valuation backend configured for this token."]
  }));

  return {
    base_currency: baseCurrency,
    prices,
    partial: prices.some((entry) => entry.price === null),
    warnings:
      prices.length > 0
        ? ["Prices are null when a trusted source is unavailable. Values are never fabricated."]
        : [],
    network
  };
}

export async function resolveToken(
  args: Record<string, unknown>,
  deps?: Partial<TokenDeps>
): Promise<any> {
  const resolvedDeps = withDeps(deps);
  const { network } = normalizeNetwork(args);
  const symbol = typeof args.symbol === "string" ? args.symbol : "";
  const requireTokenListMatch = args.require_token_list_match !== false;

  const quickRef = findTokenBySymbol(network, symbol);
  if (!quickRef) {
    throw new MantleMcpError(
      "TOKEN_NOT_FOUND",
      `Unknown token symbol: ${symbol}`,
      "Use mantle://registry/tokens to discover supported symbols.",
      { symbol, network }
    );
  }

  const warnings: string[] = [];
  let tokenListChecked = false;
  let tokenListMatch: boolean | null = null;
  let tokenListAddress: string | null = null;
  let tokenListVersion: string | null = null;
  let source: "quick_ref" | "token_list" | "both" = "quick_ref";
  let confidence: "high" | "medium" | "low" = "high";

  if (quickRef.address !== "native") {
    try {
      const snapshot = await resolvedDeps.fetchTokenListSnapshot();
      tokenListChecked = true;
      tokenListVersion = snapshot.version;
      const canonical = findTokenInCanonical(snapshot, quickRef.symbol, CHAIN_CONFIGS[network].chain_id);

      if (!canonical) {
        tokenListMatch = false;
        if (requireTokenListMatch) {
          throw new MantleMcpError(
            "TOKEN_REGISTRY_MISMATCH",
            `Token ${quickRef.symbol} missing from canonical token list.`,
            "Retry later or provide a token confirmed by the canonical token list.",
            { symbol: quickRef.symbol, network, token_list_version: tokenListVersion }
          );
        }
        confidence = "low";
        warnings.push("Token not present in canonical token list snapshot.");
      } else {
        tokenListAddress = canonical.address;
        tokenListMatch =
          canonical.address.toLowerCase() === quickRef.address.toLowerCase() &&
          canonical.decimals === quickRef.decimals;
        if (!tokenListMatch) {
          throw new MantleMcpError(
            "TOKEN_REGISTRY_MISMATCH",
            `Token registry mismatch for ${quickRef.symbol}.`,
            "Stop execution and verify the token contract address from canonical sources.",
            {
              symbol: quickRef.symbol,
              quick_ref_address: quickRef.address,
              token_list_address: canonical.address,
              quick_ref_decimals: quickRef.decimals,
              token_list_decimals: canonical.decimals
            }
          );
        }
        source = "both";
        confidence = "high";
      }
    } catch (error) {
      if (error instanceof MantleMcpError) {
        throw error;
      }
      if (requireTokenListMatch) {
        throw new MantleMcpError(
          "TOKEN_LIST_UNAVAILABLE",
          "Canonical token list is unavailable.",
          "Retry when token-list endpoint is reachable or configure a valid token-list URL.",
          { retryable: true, raw_error: error instanceof Error ? error.message : String(error) }
        );
      }
      warnings.push("Token list unavailable. Returning quick-reference result with low confidence.");
      confidence = "low";
      tokenListChecked = false;
      tokenListMatch = null;
    }
  } else {
    tokenListChecked = false;
    tokenListMatch = null;
    tokenListVersion = null;
    warnings.push("Native token resolution does not require token-list validation.");
  }

  return {
    input: symbol,
    symbol: quickRef.symbol,
    address: quickRef.address,
    decimals: quickRef.decimals,
    source,
    token_list_checked: tokenListChecked,
    token_list_match: tokenListMatch,
    token_list_address: tokenListAddress,
    token_list_version: tokenListVersion,
    confidence,
    network,
    warnings
  };
}

export const tokenTools: Record<string, Tool> = {
  getTokenInfo: {
    name: "mantle_getTokenInfo",
    description:
      "Read ERC-20 token metadata (name, symbol, decimals, total supply). Examples: token='USDC' -> 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9, token='WETH' -> 0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Token symbol or address." },
        network: { type: "string", enum: ["mainnet", "sepolia"], description: "Network." }
      },
      required: ["token"]
    },
    handler: getTokenInfo
  },
  getTokenPrices: {
    name: "mantle_getTokenPrices",
    description:
      "Read token prices for valuation workflows; returns null when no trusted source exists. Examples: tokens=['USDC','WMNT'] on mainnet (0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9, 0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8).",
    inputSchema: {
      type: "object",
      properties: {
        tokens: { type: "array", description: "Token symbols or addresses." },
        base_currency: { type: "string", enum: ["usd", "mnt"], description: "Quote currency." },
        network: { type: "string", enum: ["mainnet", "sepolia"], description: "Network." }
      },
      required: ["tokens"]
    },
    handler: getTokenPrices
  },
  resolveToken: {
    name: "mantle_resolveToken",
    description:
      "Resolve token symbol using quick reference plus canonical token-list cross-check. Examples: symbol='USDC' -> 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9, symbol='mETH' -> 0xcDA86A272531e8640cD7F1a92c01839911B90bb0.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Token symbol to resolve." },
        network: { type: "string", enum: ["mainnet", "sepolia"], description: "Network." },
        require_token_list_match: {
          type: "boolean",
          description: "Require canonical token-list match (default true)."
        }
      },
      required: ["symbol"]
    },
    handler: resolveToken
  }
};
