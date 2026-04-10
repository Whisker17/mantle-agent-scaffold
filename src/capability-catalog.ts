/**
 * Capability Catalog — structured self-description of every MCP tool.
 *
 * Each entry carries semantic metadata so an LLM can:
 *   1. Distinguish reads from writes at a glance
 *   2. Know which tools need a wallet address
 *   3. Locate the right tool via category search
 *   4. Understand call ordering via `workflow_before` hints
 */

export interface CapabilityEntry {
  /** Tool name as registered in MCP ListTools. */
  id: string;
  /** Human-readable short label. */
  name: string;
  /** Semantic category for quick filtering. */
  category: "query" | "analyze" | "execute";
  /** Whether the tool mutates on-chain state (constructs unsigned tx). */
  mutates: boolean;
  /** Whether a wallet/owner address is required or optional. */
  auth: "none" | "optional" | "required";
  /** One-line purpose. */
  summary: string;
  /** Concrete usage example (copy-pasteable args). */
  example: string;
  /** Tools typically called before this one. */
  workflow_before?: string[];
  /** Tags for free-text search. */
  tags: string[];
}

export function capabilityCatalog(): {
  version: string;
  description: string;
  capabilities: CapabilityEntry[];
} {
  return {
    version: "0.2.0",
    description:
      "Structured capability catalog for Mantle MCP tools. " +
      "Use category='query' for read-only lookups, 'analyze' for computed insights, " +
      "'execute' for transaction building. Check 'auth' to know if a wallet address is needed.",
    capabilities: CAPABILITIES
  };
}

// ---------------------------------------------------------------------------
// Static registry
// ---------------------------------------------------------------------------

const CAPABILITIES: CapabilityEntry[] = [
  // ── Chain / Network ────────────────────────────────────────────────────
  {
    id: "mantle_getChainInfo",
    name: "Get Chain Info",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Return static chain configuration (chain ID, WMNT address, RPC URLs).",
    example: "{ \"network\": \"mainnet\" }",
    tags: ["chain", "config", "network"]
  },
  {
    id: "mantle_getChainStatus",
    name: "Get Chain Status",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Live chain status: block number, gas price, sync state.",
    example: "{ \"network\": \"mainnet\" }",
    tags: ["chain", "status", "gas", "block"]
  },

  // ── Account ────────────────────────────────────────────────────────────
  {
    id: "mantle_getBalance",
    name: "Get Native Balance",
    category: "query",
    mutates: false,
    auth: "required",
    summary: "Read native MNT balance for a wallet address.",
    example: "{ \"address\": \"0x1234...\" }",
    tags: ["account", "balance", "MNT", "wallet"]
  },
  {
    id: "mantle_getTokenBalances",
    name: "Get Token Balances",
    category: "query",
    mutates: false,
    auth: "required",
    summary: "Batch read ERC-20 token balances for a wallet across specified tokens.",
    example: "{ \"address\": \"0x1234...\", \"tokens\": [\"USDC\", \"WMNT\"] }",
    tags: ["account", "balance", "token", "ERC-20", "wallet"]
  },
  {
    id: "mantle_getAllowances",
    name: "Get Allowances",
    category: "query",
    mutates: false,
    auth: "required",
    summary: "Batch read ERC-20 allowances for token/spender pairs granted by a wallet.",
    example: "{ \"owner\": \"0x1234...\", \"pairs\": [{\"token\": \"USDC\", \"spender\": \"0x319B69888b0d11cEC22caA5034e25FfFBDc88421\"}] }",
    tags: ["account", "allowance", "approve", "wallet"]
  },

  // ── Token ──────────────────────────────────────────────────────────────
  {
    id: "mantle_getTokenInfo",
    name: "Get Token Info",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Read on-chain metadata (name, symbol, decimals, totalSupply) for a token.",
    example: "{ \"token\": \"USDC\" }",
    tags: ["token", "metadata", "decimals"]
  },
  {
    id: "mantle_getTokenPrices",
    name: "Get Token Prices",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Fetch current USD prices for one or more tokens (DexScreener + DefiLlama).",
    example: "{ \"tokens\": [\"WMNT\", \"USDC\"] }",
    tags: ["token", "price", "USD"]
  },
  {
    id: "mantle_resolveToken",
    name: "Resolve Token",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Resolve a token symbol to its address and metadata via quick-reference + token-list cross-check.",
    example: "{ \"symbol\": \"mETH\" }",
    tags: ["token", "resolve", "address"]
  },

  // ── Registry ───────────────────────────────────────────────────────────
  {
    id: "mantle_resolveAddress",
    name: "Resolve Address",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Look up a contract or token by name/alias in the verified registry.",
    example: "{ \"identifier\": \"agni_router\" }",
    tags: ["registry", "address", "resolve", "contract"]
  },
  {
    id: "mantle_validateAddress",
    name: "Validate Address",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Check if an address is a contract, EOA, or undeployed; look up registry label.",
    example: "{ \"address\": \"0x1234...\" }",
    tags: ["registry", "validate", "contract", "EOA"]
  },

  // ── DeFi Read ──────────────────────────────────────────────────────────
  {
    id: "mantle_getSwapQuote",
    name: "Get Swap Quote",
    category: "analyze",
    mutates: false,
    auth: "none",
    summary: "Read swap quote across Agni, Fluxion, and Merchant Moe. Returns estimated output, price impact, and minimum_out_raw for slippage protection.",
    example: "{ \"token_in\": \"WMNT\", \"token_out\": \"USDC\", \"amount_in\": \"10\", \"provider\": \"best\" }",
    workflow_before: ["mantle_buildSwap"],
    tags: ["swap", "quote", "DEX", "price"]
  },
  {
    id: "mantle_getPoolLiquidity",
    name: "Get Pool Liquidity",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Read pool reserves and total liquidity USD for a specific pool address.",
    example: "{ \"pool_address\": \"0xABC...\", \"provider\": \"agni\" }",
    tags: ["pool", "liquidity", "reserves", "TVL"]
  },
  {
    id: "mantle_getPoolOpportunities",
    name: "Get Pool Opportunities",
    category: "analyze",
    mutates: false,
    auth: "none",
    summary: "Scan and rank candidate pools for a token pair across all Mantle DEXes.",
    example: "{ \"token_a\": \"WMNT\", \"token_b\": \"USDC\" }",
    tags: ["pool", "opportunity", "LP", "scan", "rank"]
  },
  {
    id: "mantle_getProtocolTvl",
    name: "Get Protocol TVL",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Read protocol-level TVL for Agni, Merchant Moe, or all Mantle DeFi protocols.",
    example: "{ \"protocol\": \"all\" }",
    tags: ["TVL", "protocol", "DeFi"]
  },
  {
    id: "mantle_getLendingMarkets",
    name: "Get Lending Markets",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Read Aave V3 lending market data: supply APY, borrow APY, TVL, LTV, liquidation threshold.",
    example: "{ \"protocol\": \"aave_v3\" }",
    tags: ["lending", "Aave", "APY", "supply", "borrow"]
  },

  // ── DeFi LP Read ───────────────────────────────────────────────────────
  {
    id: "mantle_getV3PoolState",
    name: "Get V3 Pool State",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Read on-chain state of a Uniswap V3 pool (Agni/Fluxion): sqrtPriceX96, current tick, liquidity, prices.",
    example: "{ \"token_a\": \"WMNT\", \"token_b\": \"USDC\", \"fee_tier\": 3000, \"provider\": \"agni\" }",
    tags: ["pool", "V3", "state", "tick", "price"]
  },
  {
    id: "mantle_getLBPairState",
    name: "Get LB Pair State",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Read on-chain state of a Merchant Moe Liquidity Book pair: active bin, reserves, nearby bins.",
    example: "{ \"token_a\": \"WMNT\", \"token_b\": \"USDC\", \"bin_step\": 20 }",
    tags: ["pool", "LB", "Merchant Moe", "bin", "state"]
  },
  {
    id: "mantle_getV3Positions",
    name: "Get V3 Positions",
    category: "query",
    mutates: false,
    auth: "required",
    summary: "Enumerate all V3 LP positions for a wallet across Agni and Fluxion: tick ranges, liquidity, uncollected fees, in-range status.",
    example: "{ \"owner\": \"0x1234...\" }",
    tags: ["LP", "position", "V3", "NFT", "wallet"]
  },
  {
    id: "mantle_suggestTickRange",
    name: "Suggest Tick Range",
    category: "analyze",
    mutates: false,
    auth: "none",
    summary: "Suggest tick ranges (wide/moderate/tight) for a V3 LP position with snapped tick bounds and prices.",
    example: "{ \"token_a\": \"WMNT\", \"token_b\": \"USDC\", \"fee_tier\": 3000, \"provider\": \"agni\" }",
    workflow_before: ["mantle_buildAddLiquidity"],
    tags: ["LP", "tick", "range", "strategy", "V3"]
  },
  {
    id: "mantle_analyzePool",
    name: "Analyze Pool",
    category: "analyze",
    mutates: false,
    auth: "none",
    summary: "Deep pool analysis: fee APR from 24h volume/TVL, multi-range APR comparison, risk scoring (TVL/volatility), and investment return projections.",
    example: "{ \"token_a\": \"WMNT\", \"token_b\": \"USDC\", \"fee_tier\": 3000, \"provider\": \"agni\" }",
    workflow_before: ["mantle_buildAddLiquidity"],
    tags: ["LP", "APR", "risk", "analysis", "yield", "pool"]
  },
  {
    id: "mantle_findPools",
    name: "Find Pools",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Discover all available pools for a token pair across Agni, Fluxion, and Merchant Moe by querying factory contracts on-chain.",
    example: "{ \"token_a\": \"USDC\", \"token_b\": \"USDe\" }",
    workflow_before: ["mantle_getV3PoolState", "mantle_analyzePool"],
    tags: ["pool", "discover", "factory", "all DEX"]
  },

  // ── DeFi Write (Transaction Builders) ──────────────────────────────────
  {
    id: "mantle_buildApprove",
    name: "Build Approve",
    category: "execute",
    mutates: true,
    auth: "optional",
    summary: "Build unsigned ERC-20 approve tx. Pass 'owner' to auto-skip if allowance is already sufficient.",
    example: "{ \"token\": \"USDC\", \"spender\": \"0x319B...\", \"amount\": \"100\", \"owner\": \"0x1234...\" }",
    workflow_before: ["mantle_buildSwap", "mantle_buildAddLiquidity", "mantle_buildAaveSupply"],
    tags: ["approve", "allowance", "ERC-20", "tx"]
  },
  {
    id: "mantle_buildWrapMnt",
    name: "Build Wrap MNT",
    category: "execute",
    mutates: true,
    auth: "none",
    summary: "Build unsigned tx to wrap MNT into WMNT.",
    example: "{ \"amount\": \"10\" }",
    tags: ["wrap", "MNT", "WMNT", "tx"]
  },
  {
    id: "mantle_buildUnwrapMnt",
    name: "Build Unwrap MNT",
    category: "execute",
    mutates: true,
    auth: "none",
    summary: "Build unsigned tx to unwrap WMNT back to MNT.",
    example: "{ \"amount\": \"10\" }",
    tags: ["unwrap", "MNT", "WMNT", "tx"]
  },
  {
    id: "mantle_buildSwap",
    name: "Build Swap",
    category: "execute",
    mutates: true,
    auth: "required",
    summary: "Build unsigned swap tx on a whitelisted DEX. Requires amount_out_min from a prior quote for slippage protection.",
    example: "{ \"provider\": \"agni\", \"token_in\": \"WMNT\", \"token_out\": \"USDC\", \"amount_in\": \"10\", \"recipient\": \"0x1234...\", \"amount_out_min\": \"7500000\" }",
    workflow_before: [],
    tags: ["swap", "DEX", "tx"]
  },
  {
    id: "mantle_buildAddLiquidity",
    name: "Build Add Liquidity",
    category: "execute",
    mutates: true,
    auth: "required",
    summary: "Build unsigned add-liquidity tx. Supports token amounts, USD amount (amount_usd), and V3/LB pools.",
    example: "{ \"provider\": \"agni\", \"token_a\": \"WMNT\", \"token_b\": \"USDC\", \"amount_a\": \"10\", \"amount_b\": \"8\", \"recipient\": \"0x1234...\" }",
    tags: ["LP", "add", "liquidity", "tx"]
  },
  {
    id: "mantle_buildRemoveLiquidity",
    name: "Build Remove Liquidity",
    category: "execute",
    mutates: true,
    auth: "required",
    summary: "Build unsigned remove-liquidity tx. V3: supports percentage mode. Merchant Moe: remove from specified bins.",
    example: "{ \"provider\": \"agni\", \"token_id\": \"12345\", \"liquidity\": \"1000000\", \"recipient\": \"0x1234...\" }",
    tags: ["LP", "remove", "liquidity", "tx"]
  },
  {
    id: "mantle_buildCollectFees",
    name: "Build Collect Fees",
    category: "execute",
    mutates: true,
    auth: "required",
    summary: "Build unsigned tx to collect accrued fees from a V3 LP position.",
    example: "{ \"provider\": \"agni\", \"token_id\": \"12345\", \"recipient\": \"0x1234...\" }",
    tags: ["LP", "fees", "collect", "V3", "tx"]
  },
  {
    id: "mantle_buildAaveSupply",
    name: "Build Aave Supply",
    category: "execute",
    mutates: true,
    auth: "required",
    summary: "Build unsigned Aave V3 supply (deposit) tx.",
    example: "{ \"asset\": \"USDC\", \"amount\": \"100\", \"on_behalf_of\": \"0x1234...\" }",
    tags: ["Aave", "supply", "deposit", "lending", "tx"]
  },
  {
    id: "mantle_buildAaveBorrow",
    name: "Build Aave Borrow",
    category: "execute",
    mutates: true,
    auth: "required",
    summary: "Build unsigned Aave V3 borrow tx. Requires sufficient collateral.",
    example: "{ \"asset\": \"USDC\", \"amount\": \"50\", \"on_behalf_of\": \"0x1234...\" }",
    tags: ["Aave", "borrow", "lending", "tx"]
  },
  {
    id: "mantle_buildAaveRepay",
    name: "Build Aave Repay",
    category: "execute",
    mutates: true,
    auth: "required",
    summary: "Build unsigned Aave V3 repay tx. Use amount='max' for full debt repayment.",
    example: "{ \"asset\": \"USDC\", \"amount\": \"50\", \"on_behalf_of\": \"0x1234...\" }",
    tags: ["Aave", "repay", "lending", "tx"]
  },
  {
    id: "mantle_buildAaveWithdraw",
    name: "Build Aave Withdraw",
    category: "execute",
    mutates: true,
    auth: "required",
    summary: "Build unsigned Aave V3 withdraw tx. Use amount='max' for full balance.",
    example: "{ \"asset\": \"USDC\", \"amount\": \"50\", \"to\": \"0x1234...\" }",
    tags: ["Aave", "withdraw", "lending", "tx"]
  },
  {
    id: "mantle_getSwapPairs",
    name: "Get Swap Pairs",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "List known trading pairs and pool parameters for a DEX. Call before buildSwap to get correct fee_tier/bin_step.",
    example: "{ \"provider\": \"agni\" }",
    workflow_before: ["mantle_buildSwap"],
    tags: ["swap", "pairs", "DEX", "config"]
  },

  // ── Indexer ────────────────────────────────────────────────────────────
  {
    id: "mantle_querySubgraph",
    name: "Query Subgraph",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Execute a GraphQL query against a Mantle subgraph endpoint.",
    example: "{ \"endpoint\": \"https://...\", \"query\": \"{ pools(first:5) { id } }\" }",
    tags: ["indexer", "subgraph", "GraphQL"]
  },
  {
    id: "mantle_queryIndexerSql",
    name: "Query Indexer SQL",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Execute a read-only SQL query against an indexer endpoint.",
    example: "{ \"endpoint\": \"https://...\", \"query\": \"SELECT * FROM pools LIMIT 10\" }",
    tags: ["indexer", "SQL", "query"]
  },

  // ── Diagnostics ────────────────────────────────────────────────────────
  {
    id: "mantle_checkRpcHealth",
    name: "Check RPC Health",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Health-check the configured RPC endpoint: reachability, chain ID, latency.",
    example: "{ \"network\": \"mainnet\" }",
    tags: ["diagnostics", "RPC", "health"]
  },
  {
    id: "mantle_probeEndpoint",
    name: "Probe Endpoint",
    category: "query",
    mutates: false,
    auth: "none",
    summary: "Send an arbitrary allowed RPC call to probe an endpoint.",
    example: "{ \"rpc_url\": \"https://...\", \"method\": \"eth_blockNumber\" }",
    tags: ["diagnostics", "RPC", "probe"]
  }
];
