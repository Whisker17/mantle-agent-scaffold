import { formatUnits, getAddress, isAddress, parseUnits } from "viem";
import { MANTLE_PROTOCOLS } from "../config/protocols.js";
import { MantleMcpError } from "../errors.js";
import { normalizeNetwork } from "../lib/network.js";
import { resolveTokenInput as resolveTokenInputFromRegistry } from "../lib/token-registry.js";
import type { ResolvedTokenInput } from "../lib/token-registry.js";
import type { Tool } from "../types.js";

interface SwapQuoteDeps {
  resolveTokenInput: (
    token: string,
    network?: "mainnet" | "sepolia"
  ) => Promise<ResolvedTokenInput> | ResolvedTokenInput;
  quoteProvider: (params: {
    provider: "agni" | "merchant_moe";
    tokenIn: ResolvedTokenInput;
    tokenOut: ResolvedTokenInput;
    amountInRaw: bigint;
    network: "mainnet" | "sepolia";
    feeTier: number | null;
  }) => Promise<{
    estimated_out_raw: string;
    estimated_out_decimal: string;
    price_impact_pct: number | null;
    route: string;
    fee_tier: number | null;
  } | null>;
  now: () => string;
}

interface PoolLiquidityDeps {
  readPool: (params: {
    poolAddress: string;
    provider: "agni" | "merchant_moe";
    network: "mainnet" | "sepolia";
  }) => Promise<{
    token_0: { address: string; symbol: string | null; decimals: number | null };
    token_1: { address: string; symbol: string | null; decimals: number | null };
    reserve_0_raw: string;
    reserve_1_raw: string;
    fee_tier: number | null;
    total_liquidity_usd?: number | null;
  } | null>;
  getTokenPrices: (params: {
    network: "mainnet" | "sepolia";
    tokenAddresses: [string, string];
  }) => Promise<Record<string, number | null>>;
  now: () => string;
}

interface LendingMarketsDeps {
  marketProvider: (params: {
    protocol: "aave_v3";
    network: "mainnet" | "sepolia";
  }) => Promise<Array<{
    protocol: string;
    asset: string;
    asset_address: string;
    supply_apy: number;
    borrow_apy_variable: number;
    borrow_apy_stable: number | null;
    tvl_usd: number | null;
    ltv: number | null;
    liquidation_threshold: number | null;
  }>>;
  now: () => string;
}

const defaultSwapDeps: SwapQuoteDeps = {
  resolveTokenInput: (token, network) => resolveTokenInputFromRegistry(token, network ?? "mainnet"),
  quoteProvider: async () => null,
  now: () => new Date().toISOString()
};

const defaultPoolDeps: PoolLiquidityDeps = {
  readPool: async () => null,
  getTokenPrices: async () => ({}),
  now: () => new Date().toISOString()
};

const defaultLendingDeps: LendingMarketsDeps = {
  marketProvider: async () => [],
  now: () => new Date().toISOString()
};

type SwapProviderQuote = NonNullable<Awaited<ReturnType<SwapQuoteDeps["quoteProvider"]>>>;

function withSwapDeps(overrides?: Partial<SwapQuoteDeps>): SwapQuoteDeps {
  return { ...defaultSwapDeps, ...overrides };
}

function withPoolDeps(overrides?: Partial<PoolLiquidityDeps>): PoolLiquidityDeps {
  return { ...defaultPoolDeps, ...overrides };
}

function withLendingDeps(overrides?: Partial<LendingMarketsDeps>): LendingMarketsDeps {
  return { ...defaultLendingDeps, ...overrides };
}

function resolveRouterAddress(
  provider: "agni" | "merchant_moe",
  network: "mainnet" | "sepolia"
): string {
  const entry = MANTLE_PROTOCOLS[network][provider];
  if (!entry || entry.status !== "enabled") {
    throw new MantleMcpError(
      "UNSUPPORTED_PROTOCOL",
      `${provider} is not enabled on ${network}.`,
      "Use an enabled protocol or switch network.",
      { provider, network }
    );
  }

  const router =
    provider === "agni"
      ? entry.contracts.swap_router
      : entry.contracts.lb_router_v2_2;

  if (!router || !isAddress(router, { strict: false })) {
    throw new MantleMcpError(
      "UNSUPPORTED_PROTOCOL",
      `${provider} router is not configured for ${network}.`,
      "Check protocol registry configuration.",
      { provider, network }
    );
  }

  return getAddress(router);
}

function parseRawAmount(value: string, field: string, details: Record<string, unknown>): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new MantleMcpError(
      "INVALID_INPUT",
      `${field} must be a base-10 integer string.`,
      "Check upstream data source and retry.",
      details
    );
  }
}

export async function getSwapQuote(
  args: Record<string, unknown>,
  deps?: Partial<SwapQuoteDeps>
): Promise<any> {
  const resolvedDeps = withSwapDeps(deps);
  const { network } = normalizeNetwork(args);
  const tokenInInput = typeof args.token_in === "string" ? args.token_in : "";
  const tokenOutInput = typeof args.token_out === "string" ? args.token_out : "";
  const amountInInput = typeof args.amount_in === "string" ? args.amount_in : "";
  const providerInput =
    typeof args.provider === "string" ? args.provider : "best";
  const feeTier = typeof args.fee_tier === "number" ? args.fee_tier : null;

  if (!tokenInInput || !tokenOutInput || !amountInInput) {
    throw new MantleMcpError(
      "INVALID_INPUT",
      "token_in, token_out, and amount_in are required.",
      "Provide token_in, token_out, and amount_in values.",
      { token_in: tokenInInput || null, token_out: tokenOutInput || null, amount_in: amountInInput || null }
    );
  }

  let providerSelection: "agni" | "merchant_moe" | "best";
  if (providerInput === "agni" || providerInput === "merchant_moe" || providerInput === "best") {
    providerSelection = providerInput;
  } else {
    throw new MantleMcpError(
      "INVALID_INPUT",
      `Unsupported provider: ${providerInput}`,
      "Use provider=agni, provider=merchant_moe, or provider=best.",
      { provider: providerInput }
    );
  }

  const tokenIn = await resolvedDeps.resolveTokenInput(tokenInInput, network);
  const tokenOut = await resolvedDeps.resolveTokenInput(tokenOutInput, network);

  if (tokenIn.decimals == null || tokenOut.decimals == null || tokenIn.address === "native" || tokenOut.address === "native") {
    throw new MantleMcpError(
      "TOKEN_NOT_FOUND",
      "Swap quote requires ERC-20 tokens with known decimals.",
      "Use ERC-20 token symbols/addresses available in mantle://registry/tokens.",
      { token_in: tokenInInput, token_out: tokenOutInput }
    );
  }

  if (tokenIn.address.toLowerCase() === tokenOut.address.toLowerCase()) {
    throw new MantleMcpError(
      "INVALID_INPUT",
      "token_in and token_out must be different.",
      "Choose two different ERC-20 tokens for swap quote.",
      {
        token_in: tokenIn.address,
        token_out: tokenOut.address
      }
    );
  }

  let amountInRaw: bigint;
  try {
    amountInRaw = parseUnits(amountInInput, tokenIn.decimals);
  } catch {
    throw new MantleMcpError(
      "INVALID_INPUT",
      "amount_in is not a valid decimal amount.",
      "Provide a positive decimal amount_in with token precision.",
      { amount_in: amountInInput, token_decimals: tokenIn.decimals }
    );
  }

  if (amountInRaw <= 0n) {
    throw new MantleMcpError(
      "INVALID_INPUT",
      "amount_in must be greater than zero.",
      "Provide a positive decimal amount_in.",
      { amount_in: amountInInput }
    );
  }

  const warnings: string[] = [];
  let selectedProvider: "agni" | "merchant_moe";
  let quote: SwapProviderQuote | null = null;

  if (providerSelection === "best") {
    const [agniResult, merchantMoeResult] = await Promise.allSettled([
      resolvedDeps.quoteProvider({
        provider: "agni",
        tokenIn,
        tokenOut,
        amountInRaw,
        network,
        feeTier
      }),
      resolvedDeps.quoteProvider({
        provider: "merchant_moe",
        tokenIn,
        tokenOut,
        amountInRaw,
        network,
        feeTier
      })
    ]);

    const candidates: Array<{
      provider: "agni" | "merchant_moe";
      quote: SwapProviderQuote;
      outRaw: bigint;
    }> = [];

    if (agniResult.status === "fulfilled" && agniResult.value) {
      candidates.push({
        provider: "agni",
        quote: agniResult.value,
        outRaw: parseRawAmount(agniResult.value.estimated_out_raw, "estimated_out_raw", {
          provider: "agni",
          token_in: tokenIn.address,
          token_out: tokenOut.address
        })
      });
    }

    if (merchantMoeResult.status === "fulfilled" && merchantMoeResult.value) {
      candidates.push({
        provider: "merchant_moe",
        quote: merchantMoeResult.value,
        outRaw: parseRawAmount(merchantMoeResult.value.estimated_out_raw, "estimated_out_raw", {
          provider: "merchant_moe",
          token_in: tokenIn.address,
          token_out: tokenOut.address
        })
      });
    }

    if (candidates.length === 0) {
      throw new MantleMcpError(
        "NO_ROUTE",
        `No route found for ${tokenIn.symbol} -> ${tokenOut.symbol}.`,
        "Try another provider or pair.",
        {
          token_in: tokenIn.address,
          token_out: tokenOut.address,
          provider: "best",
          network
        }
      );
    }

    candidates.sort((a, b) => (a.outRaw === b.outRaw ? 0 : a.outRaw > b.outRaw ? -1 : 1));
    selectedProvider = candidates[0].provider;
    quote = candidates[0].quote;

    if (candidates.length === 1) {
      warnings.push("Best-route fallback used a single provider because the other had no quote.");
    }
  } else {
    selectedProvider = providerSelection;
    quote = await resolvedDeps.quoteProvider({
      provider: selectedProvider,
      tokenIn,
      tokenOut,
      amountInRaw,
      network,
      feeTier
    });

    if (!quote) {
      throw new MantleMcpError(
        "NO_ROUTE",
        `No route found for ${tokenIn.symbol} -> ${tokenOut.symbol}.`,
        "Try another provider or pair.",
        {
          token_in: tokenIn.address,
          token_out: tokenOut.address,
          provider: selectedProvider,
          network
        }
      );
    }
  }

  const routerAddress = resolveRouterAddress(selectedProvider, network);
  const estimatedOutRaw = parseRawAmount(quote.estimated_out_raw, "estimated_out_raw", {
    provider: selectedProvider,
    token_in: tokenIn.address,
    token_out: tokenOut.address
  });
  const minimumOutRaw = (estimatedOutRaw * 9950n) / 10000n;

  if (quote.price_impact_pct != null && quote.price_impact_pct > 1) {
    warnings.push("High price impact.");
  }

  return {
    provider: selectedProvider,
    token_in: {
      address: tokenIn.address,
      symbol: tokenIn.symbol,
      decimals: tokenIn.decimals
    },
    token_out: {
      address: tokenOut.address,
      symbol: tokenOut.symbol,
      decimals: tokenOut.decimals
    },
    amount_in_raw: amountInRaw.toString(),
    amount_in_decimal: amountInInput,
    estimated_out_raw: estimatedOutRaw.toString(),
    estimated_out_decimal: quote.estimated_out_decimal,
    minimum_out_raw: minimumOutRaw.toString(),
    minimum_out_decimal: formatUnits(minimumOutRaw, tokenOut.decimals),
    price_impact_pct: quote.price_impact_pct,
    route: quote.route,
    router_address: routerAddress,
    fee_tier: quote.fee_tier,
    quoted_at_utc: resolvedDeps.now(),
    warnings
  };
}

function deriveLiquidityUsdFromReserves(
  reserve0Raw: bigint,
  reserve1Raw: bigint,
  decimals0: number,
  decimals1: number,
  price0Usd: number,
  price1Usd: number
): number {
  const reserve0 = Number(formatUnits(reserve0Raw, decimals0));
  const reserve1 = Number(formatUnits(reserve1Raw, decimals1));
  return reserve0 * price0Usd + reserve1 * price1Usd;
}

export async function getPoolLiquidity(
  args: Record<string, unknown>,
  deps?: Partial<PoolLiquidityDeps>
): Promise<any> {
  const resolvedDeps = withPoolDeps(deps);
  const { network } = normalizeNetwork(args);
  const poolAddressInput = typeof args.pool_address === "string" ? args.pool_address : "";
  const providerInput = typeof args.provider === "string" ? args.provider : "agni";
  const provider: "agni" | "merchant_moe" =
    providerInput === "merchant_moe" ? "merchant_moe" : "agni";

  if (!poolAddressInput || !isAddress(poolAddressInput, { strict: false })) {
    throw new MantleMcpError(
      "INVALID_ADDRESS",
      "pool_address must be a valid address.",
      "Provide a checksummed pool address.",
      { pool_address: poolAddressInput || null }
    );
  }

  const poolAddress = getAddress(poolAddressInput);
  const data = await resolvedDeps.readPool({
    poolAddress,
    provider,
    network
  });

  if (!data) {
    throw new MantleMcpError(
      "POOL_NOT_FOUND",
      `Pool not found: ${poolAddress}`,
      "Verify the pool address and provider.",
      { pool_address: poolAddress, provider, network }
    );
  }

  const reserve0Raw = parseRawAmount(data.reserve_0_raw, "reserve_0_raw", {
    pool_address: poolAddress,
    provider,
    network
  });
  const reserve1Raw = parseRawAmount(data.reserve_1_raw, "reserve_1_raw", {
    pool_address: poolAddress,
    provider,
    network
  });

  const reserve0Decimal =
    data.token_0.decimals == null ? null : formatUnits(reserve0Raw, data.token_0.decimals);
  const reserve1Decimal =
    data.token_1.decimals == null ? null : formatUnits(reserve1Raw, data.token_1.decimals);

  const warnings: string[] = [];
  let totalLiquidityUsd = typeof data.total_liquidity_usd === "number" ? data.total_liquidity_usd : null;

  if (
    totalLiquidityUsd == null &&
    data.token_0.decimals != null &&
    data.token_1.decimals != null
  ) {
    const priceMap = await resolvedDeps.getTokenPrices({
      network,
      tokenAddresses: [data.token_0.address, data.token_1.address]
    });

    const token0Price = priceMap[data.token_0.address.toLowerCase()] ?? null;
    const token1Price = priceMap[data.token_1.address.toLowerCase()] ?? null;

    if (typeof token0Price === "number" && typeof token1Price === "number") {
      const derived = deriveLiquidityUsdFromReserves(
        reserve0Raw,
        reserve1Raw,
        data.token_0.decimals,
        data.token_1.decimals,
        token0Price,
        token1Price
      );
      if (Number.isFinite(derived)) {
        totalLiquidityUsd = derived;
      }
    }
  }

  if (totalLiquidityUsd == null) {
    warnings.push("total_liquidity_usd is null due to unavailable valuation source.");
  }

  return {
    pool_address: poolAddress,
    provider,
    token_0: data.token_0,
    token_1: data.token_1,
    reserve_0_raw: reserve0Raw.toString(),
    reserve_0_decimal: reserve0Decimal,
    reserve_1_raw: reserve1Raw.toString(),
    reserve_1_decimal: reserve1Decimal,
    total_liquidity_usd: totalLiquidityUsd,
    fee_tier: data.fee_tier,
    collected_at_utc: resolvedDeps.now(),
    warnings
  };
}

export async function getLendingMarkets(
  args: Record<string, unknown>,
  deps?: Partial<LendingMarketsDeps>
): Promise<any> {
  const resolvedDeps = withLendingDeps(deps);
  const { network } = normalizeNetwork(args);
  const protocolInput = typeof args.protocol === "string" ? args.protocol : "all";
  const asset = typeof args.asset === "string" ? args.asset : null;

  const protocol =
    protocolInput === "aave" ? "aave_v3" : protocolInput;

  if (!["all", "aave_v3"].includes(protocol)) {
    throw new MantleMcpError(
      "UNSUPPORTED_PROTOCOL",
      `Unsupported lending protocol: ${protocolInput}`,
      "Use protocol=aave_v3, aave, or all.",
      { protocol: protocolInput }
    );
  }

  const marketChunks = await Promise.all([
    resolvedDeps.marketProvider({ protocol: "aave_v3", network })
  ]);

  const allMarkets = marketChunks.flat();
  const filteredMarkets = asset
    ? allMarkets.filter(
        (market) =>
          market.asset.toLowerCase() === asset.toLowerCase() ||
          market.asset_address.toLowerCase() === asset.toLowerCase()
      )
    : allMarkets;

  return {
    markets: filteredMarkets,
    collected_at_utc: resolvedDeps.now(),
    partial: false
  };
}

export const defiReadTools: Record<string, Tool> = {
  getSwapQuote: {
    name: "mantle_getSwapQuote",
    description:
      "Read swap quotes for Agni and Merchant Moe routes. Examples: WMNT 0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8 to USDC 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9 via Agni router 0x319B69888b0d11cEC22caA5034e25FfFBDc88421.",
    inputSchema: {
      type: "object",
      properties: {
        token_in: { type: "string", description: "Input token symbol/address." },
        token_out: { type: "string", description: "Output token symbol/address." },
        amount_in: { type: "string", description: "Human-readable amount in." },
        provider: {
          type: "string",
          enum: ["agni", "merchant_moe", "best"],
          description: "Routing provider"
        },
        fee_tier: { type: "number", description: "Optional V3 fee tier." },
        network: { type: "string", enum: ["mainnet", "sepolia"], description: "Network" }
      },
      required: ["token_in", "token_out", "amount_in"]
    },
    handler: getSwapQuote
  },
  getPoolLiquidity: {
    name: "mantle_getPoolLiquidity",
    description:
      "Read pool reserves and liquidity metadata. Examples: inspect a Mantle DEX pool for USDC 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9 / USDT 0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE liquidity.",
    inputSchema: {
      type: "object",
      properties: {
        pool_address: { type: "string", description: "Pool contract address." },
        provider: {
          type: "string",
          enum: ["agni", "merchant_moe"],
          description: "DEX provider"
        },
        network: { type: "string", enum: ["mainnet", "sepolia"], description: "Network" }
      },
      required: ["pool_address"]
    },
    handler: getPoolLiquidity
  },
  getLendingMarkets: {
    name: "mantle_getLendingMarkets",
    description:
      "Read Aave v3 lending market metrics on Mantle. Examples: USDC market 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9 with pool 0x458F293454fE0d67EC0655f3672301301DD51422.",
    inputSchema: {
      type: "object",
      properties: {
        protocol: {
          type: "string",
          enum: ["aave_v3", "aave", "all"],
          description: "Lending protocol selector"
        },
        asset: { type: "string", description: "Optional asset filter." },
        network: { type: "string", enum: ["mainnet", "sepolia"], description: "Network" }
      },
      required: []
    },
    handler: getLendingMarkets
  }
};
