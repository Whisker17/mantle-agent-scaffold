# Mantle Skills MCP Server - Design Spec

> MCP server design that provides the runtime execution layer for the 9 mantle-skills.
> Skills define what the agent should think and decide; this MCP server provides the stateless tools the agent calls to read chain state, simulate transactions, and build unsigned payloads.

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Architecture](#2-architecture)
3. [Skill-to-Tool Mapping Matrix](#3-skill-to-tool-mapping-matrix)
4. [Tool Catalog](#4-tool-catalog)
5. [MCP Resources](#5-mcp-resources)
6. [MCP Prompts](#6-mcp-prompts)
7. [Error Contract](#7-error-contract)
8. [Security Model](#8-security-model)
9. [Configuration](#9-configuration)
10. [Relationship to mantle-skills](#10-relationship-to-mantle-skills)

---

## 1. Design Philosophy

### Skills are Brains, MCP is Muscle

The 9 skills in `skills/` are **orchestration logic** -- they tell the agent *how to think* about a task, *what order* to perform steps, and *when to stop*. They do not perform any on-chain interactions directly.

The MCP server is the **execution substrate** -- stateless, deterministic tools that accept structured input and return structured output. Every on-chain read, simulation, quote, and transaction build flows through an MCP tool.

This separation means:
- Skills can evolve (new workflows, stricter guardrails) without touching MCP code.
- MCP tools can be swapped or upgraded (new RPC provider, new DEX aggregator) without rewriting skills.
- The attack surface for on-chain operations is confined to the MCP layer, auditable independently.

### Core Tenets

**T1. Stateless tools.** Every MCP tool is a pure function: same input produces same output (modulo on-chain state at call time). No session state, no user memory, no accumulated context between tool calls.

**T2. Skills orchestrate, tools execute.** A tool never decides *whether* to proceed -- it does what the skill asks and reports what happened. Risk decisions, confirmation gates, and workflow branching live in skills.

**T3. Fail closed.** When a tool cannot produce a trustworthy result, it returns a typed error with a suggestion. It never returns fabricated data, approximate addresses, or optimistic estimates.

**T4. Unsigned only.** Transaction-building tools return unsigned payloads. The MCP server never holds private keys, never signs, and never broadcasts. Signing happens outside the scaffold entirely.

**T5. Human summary mandatory.** Every transaction-building tool returns a `human_summary` field -- a plain-language description of what the transaction will do. Skills present this to the user for confirmation before any signing step.

**T6. MNT-native.** Gas estimates, fee calculations, and native balances are denominated in MNT. ETH values appear only when ETH is the actual asset in context (e.g., mETH staking on L1).

---

## 2. Architecture

### 2.1 Three-Layer Pattern

```
┌─────────────────────────────────────────────────┐
│                Transport Layer                  │
│   stdio (local agents)  |  HTTP/SSE (remote)    │
│   Connection lifecycle, JSON-RPC framing        │
├─────────────────────────────────────────────────┤
│                Protocol Layer                   │
│   @modelcontextprotocol/sdk                     │
│   Tool / Resource / Prompt registration         │
│   Input validation (zod schemas)                │
│   Output serialization                          │
├─────────────────────────────────────────────────┤
│                 Logic Layer                     │
│   viem public client (lazy singleton per chain) │
│   On-chain reads (balanceOf, allowance, ...)    │
│   Simulation (eth_call, state overrides)        │
│   External APIs (indexers, DEX aggregators)     │
│   Transaction encoding and building             │
│   Error classification                          │
└─────────────────────────────────────────────────┘
```

- **Transport** handles wire protocol only. Adding WebSocket support touches nothing below.
- **Protocol** handles MCP SDK registration and schema validation. Tool schemas are testable in isolation.
- **Logic** handles all chain interaction. Every function in this layer can be unit-tested without MCP overhead.

### 2.2 Dual Transport

| Transport | Use Case | Client Example |
|-----------|----------|---------------|
| stdio | Local agents (Claude Code, Cursor, OpenAI agents) | `npx tsx mcp-server/src/index.ts` |
| Streamable HTTP + SSE | Remote or web-based agents, shared team servers | `http://localhost:3100/mcp` |

The server entrypoint selects transport via environment variable. Both transports expose the same tool/resource/prompt surface.

### 2.3 Proposed Directory Structure

```
mantle-mcp/
├── src/
│   ├── index.ts                    # Entrypoint: transport selection
│   ├── server.ts                   # Protocol layer: McpServer setup, registration hub
│   ├── tools/
│   │   ├── chain.ts                # mantle_getChainInfo, mantle_getChainStatus
│   │   ├── registry.ts             # mantle_resolveAddress, mantle_validateAddress
│   │   ├── account.ts              # mantle_getBalance, mantle_getTokenBalances, mantle_getAllowances
│   │   ├── token.ts                # mantle_getTokenInfo, mantle_resolveToken
│   │   ├── indexer.ts              # mantle_querySubgraph, mantle_queryIndexerSql
│   │   ├── defi-read.ts            # mantle_getSwapQuote, mantle_getPoolLiquidity, mantle_getLendingMarkets
│   │   ├── simulation.ts           # mantle_simulateTx, mantle_decodeCalldata, mantle_decodeError
│   │   ├── diagnostics.ts          # mantle_checkRpcHealth, mantle_probeEndpoint
│   │   ├── tx-build.ts             # mantle_buildTransferTx, mantle_buildApproveTx, mantle_buildSwapTx,
│   │   │                           # mantle_buildLiquidityTx, mantle_buildDeployTx
│   │   ├── tx-monitor.ts           # mantle_getTransactionReceipt, mantle_waitForReceipt
│   │   └── explorer.ts             # mantle_verifyContract, mantle_checkVerification, mantle_getExplorerUrl
│   ├── resources/
│   │   ├── chain-config.ts         # mantle://chain/{network}
│   │   ├── token-registry.ts       # mantle://registry/tokens
│   │   ├── contract-registry.ts    # mantle://registry/contracts
│   │   ├── protocol-registry.ts    # mantle://registry/protocols
│   │   ├── abi-registry.ts         # mantle://abis/{name}
│   │   └── network-basics.ts       # mantle://docs/network-basics
│   ├── prompts/
│   │   ├── portfolio-audit.ts
│   │   ├── swap-workflow.ts
│   │   ├── deploy-workflow.ts
│   │   ├── debug-read-failure.ts
│   │   └── risk-preflight.ts
│   ├── providers/
│   │   ├── rpc.ts                  # viem client factory, multicall batching
│   │   ├── agni.ts                 # Agni Finance quoter reads
│   │   ├── merchantmoe.ts          # Merchant Moe quoter reads
│   │   ├── lendle.ts               # Lendle pool reads
│   │   ├── indexer.ts              # Subgraph / SQL indexer client
│   │   └── explorer-api.ts         # Mantlescan verification API
│   ├── config/
│   │   ├── chains.ts               # Chain definitions (mainnet, sepolia)
│   │   ├── tokens.ts               # Token registry data
│   │   ├── protocols.ts            # Protocol contract addresses
│   │   └── abis.ts                 # ABI imports
│   └── utils/
│       ├── format.ts               # BigInt serialization, amount formatting
│       ├── errors.ts               # Typed error builder
│       └── validation.ts           # Address checksum, input normalization
├── tests/
│   ├── tools/                      # Per-tool unit tests
│   ├── providers/                  # Provider integration tests
│   └── fixtures/                   # Mock RPC responses
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### 2.4 How an Agent Uses Skills + MCP Together

```
User: "What's the USDC balance of 0xABC... on Mantle?"

Agent loads: mantle-portfolio-analyst SKILL.md
  → Workflow step 1: "Confirm inputs" → wallet_address = 0xABC..., environment = mainnet
  → Workflow step 2: "Resolve environment RPC" → Agent calls mantle_getChainInfo(network: "mainnet")
  → Workflow step 3: "Fetch native balance" → Agent calls mantle_getBalance(address: "0xABC...", network: "mainnet")
  → Workflow step 4: "Enumerate token balances" → Agent calls mantle_getTokenBalances(address: "0xABC...", tokens: ["USDC"], network: "mainnet")
  → Workflow step 5: "Enumerate allowances" → Agent calls mantle_getAllowances(owner: "0xABC...", tokens: ["USDC"], spenders: [...], network: "mainnet")
  → Workflow step 6: "Classify risk" → Agent applies allowance-risk-rules.md logic internally
  → Workflow step 7: "Return formatted report" → Agent formats output per skill template
```

The skill provides the reasoning structure. The MCP tools provide the data.

---

## 3. Skill-to-Tool Mapping Matrix

This matrix maps every skill workflow step to the MCP tools it requires. Tool names prefixed with `mantle_` are defined in section 4. Resource URIs prefixed with `mantle://` are defined in section 5.

### 3.1 mantle-network-primer

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Load Mantle basics | Resource: `mantle://docs/network-basics` |
| Answer chain config questions | `mantle_getChainInfo` |
| Answer live status questions | `mantle_getChainStatus` |
| Cross-check contract addresses | `mantle_resolveAddress` |

### 3.2 mantle-address-registry-navigator

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Source priority #1: get_contract_address tool | `mantle_resolveAddress` |
| Source priority #2: local registry file | Resource: `mantle://registry/contracts` |
| Validate EIP-55 checksum and not zero-address | `mantle_validateAddress` |
| Verify entry provenance | Embedded in `mantle_resolveAddress` response |

### 3.3 mantle-portfolio-analyst

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Resolve environment RPC and chain ID | `mantle_getChainInfo` |
| Fetch native MNT balance | `mantle_getBalance` |
| Enumerate token balances (batch) | `mantle_getTokenBalances` |
| Fetch token metadata (decimals, symbol) | `mantle_getTokenInfo` |
| Enumerate allowances (batch) | `mantle_getAllowances` |
| Discover known tokens/spenders | Resource: `mantle://registry/tokens`, `mantle://registry/protocols` |

### 3.4 mantle-data-indexer

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Execute GraphQL query against subgraph | `mantle_querySubgraph` |
| Execute SQL query against indexer warehouse | `mantle_queryIndexerSql` |

### 3.5 mantle-risk-evaluator

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Slippage check (need quote for price impact) | `mantle_getSwapQuote` |
| Liquidity depth check | `mantle_getPoolLiquidity` |
| Address safety check | `mantle_resolveAddress`, `mantle_validateAddress` |
| Gas and deadline sanity | `mantle_simulateTx` (gas estimate from simulation) |
| Allowance scope check | `mantle_getAllowances` |

### 3.6 mantle-tx-simulator

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Capture pre-state (balances, allowances) | `mantle_getBalance`, `mantle_getTokenBalances`, `mantle_getAllowances` |
| Execute simulation | `mantle_simulateTx` |
| Decode calldata for human display | `mantle_decodeCalldata` |
| Decode revert reason on failure | `mantle_decodeError` |
| Construct WYSIWYS summary | Agent applies `references/wysiwys-template.md` to `mantle_simulateTx` output |

### 3.7 mantle-readonly-debugger

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Check RPC endpoint health | `mantle_checkRpcHealth` |
| Probe alternate endpoint | `mantle_probeEndpoint` |
| Classify error signature | `mantle_decodeError` |
| Re-run failing read for reproduction | Any relevant read tool (context-dependent) |

### 3.8 mantle-smart-contract-deployer

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Confirm environment and chain ID | `mantle_getChainInfo` |
| Estimate deployment gas and cost | `mantle_simulateTx` |
| Build deployment transaction | `mantle_buildDeployTx` |
| Monitor deployment receipt | `mantle_getTransactionReceipt`, `mantle_waitForReceipt` |
| Submit source verification | `mantle_verifyContract` |
| Poll verification status | `mantle_checkVerification` |
| Get explorer URL for deployed contract | `mantle_getExplorerUrl` |

### 3.9 mantle-defi-operator

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Resolve token metadata (decimals, symbol) | `mantle_getTokenInfo`, `mantle_resolveToken` |
| Get swap quote and route | `mantle_getSwapQuote` |
| Check current allowance | `mantle_getAllowances` |
| Build approve transaction | `mantle_buildApproveTx` |
| Build swap transaction | `mantle_buildSwapTx` |
| Build add/remove liquidity transaction | `mantle_buildLiquidityTx` |
| Monitor execution receipt | `mantle_getTransactionReceipt`, `mantle_waitForReceipt` |
| Verify post-trade balances | `mantle_getBalance`, `mantle_getTokenBalances` |
| Resolve trusted addresses | `mantle_resolveAddress` |

---

## 4. Tool Catalog

All tools use the `mantle_` prefix. Input schemas use zod notation for clarity. Every tool returns `{ content: [{ type: "text", text: JSON.stringify(result) }] }` per MCP protocol.

### 4.1 Chain & Network Tools

Supports: mantle-network-primer, mantle-smart-contract-deployer, mantle-portfolio-analyst.

---

**`mantle_getChainInfo`**

Returns static chain configuration for the requested network.

```
Input:
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    chain_id: number,
    name: string,
    native_token: { symbol: string, decimals: number },
    rpc_url: string,
    ws_url: string | null,
    explorer_url: string,
    bridge_url: string,
    recommended_solidity_compiler: string
  }
```

---

**`mantle_getChainStatus`**

Returns live network status from RPC.

```
Input:
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    chain_id: number,
    block_number: number,
    gas_price_wei: string,
    gas_price_gwei: string,
    timestamp_utc: string,
    syncing: boolean
  }
```

---

### 4.2 Address Registry Tools

Supports: mantle-address-registry-navigator, mantle-risk-evaluator, mantle-defi-operator.

---

**`mantle_resolveAddress`**

Lookup a contract address by key, symbol, or alias from the trusted registry. Returns provenance metadata. Fails closed when no verified match exists.

```
Input:
  identifier: z.string()               # contract key, token symbol, or alias
  environment: z.enum(["mainnet", "testnet"]).default("mainnet")
  category: z.enum(["system", "token", "bridge", "defi", "any"]).default("any")

Output (success):
  {
    identifier: string,
    environment: string,
    address: string,                    # EIP-55 checksummed
    label: string,
    category: string,
    status: "active" | "deprecated" | "paused",
    is_official: boolean,
    source_url: string,
    source_retrieved_at: string,        # ISO-8601
    confidence: "high" | "medium" | "low",
    aliases: string[]
  }

Output (no match):
  Error with code ADDRESS_NOT_FOUND
```

---

**`mantle_validateAddress`**

Validate an address format and check safety signals without looking it up in the registry.

```
Input:
  address: z.string()
  check_code: z.boolean().default(false)  # also check if address has deployed code
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    address: string,                    # normalized EIP-55
    valid_format: boolean,
    is_zero_address: boolean,
    is_checksummed: boolean,
    has_code: boolean | null,           # null if check_code=false
    registry_match: string | null,      # label if found in registry, null otherwise
    warnings: string[]
  }
```

---

### 4.3 Account & Balance Tools

Supports: mantle-portfolio-analyst, mantle-tx-simulator, mantle-defi-operator.

---

**`mantle_getBalance`**

Get native MNT balance for an address.

```
Input:
  address: z.string()
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    address: string,
    network: string,
    balance_wei: string,
    balance_mnt: string,                # human-readable decimal
    block_number: number,
    collected_at_utc: string
  }
```

---

**`mantle_getTokenBalances`**

Batch-read ERC-20 balances for a list of tokens. Uses multicall for efficiency.

```
Input:
  address: z.string()
  tokens: z.array(z.string())          # token addresses or symbols
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    address: string,
    network: string,
    balances: [
      {
        token_address: string,
        symbol: string | null,
        decimals: number | null,
        balance_raw: string,
        balance_normalized: string | null,  # null if decimals unknown
        error: string | null                # non-null if individual read failed
      }
    ],
    block_number: number,
    collected_at_utc: string,
    partial: boolean                    # true if some reads failed
  }
```

---

**`mantle_getAllowances`**

Batch-read ERC-20 allowances for token-spender pairs.

```
Input:
  owner: z.string()
  pairs: z.array(z.object({
    token: z.string(),                  # token address or symbol
    spender: z.string()                 # spender address
  }))
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    owner: string,
    network: string,
    allowances: [
      {
        token_address: string,
        token_symbol: string | null,
        token_decimals: number | null,
        spender: string,
        spender_label: string | null,   # from registry if known
        allowance_raw: string,
        allowance_normalized: string | null,
        is_unlimited: boolean,          # raw >= 2^255
        error: string | null
      }
    ],
    block_number: number,
    collected_at_utc: string,
    partial: boolean
  }
```

---

### 4.4 Token Tools

Supports: mantle-defi-operator, mantle-portfolio-analyst, mantle-risk-evaluator.

---

**`mantle_getTokenInfo`**

Read on-chain token metadata.

```
Input:
  token: z.string()                     # address or symbol
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    address: string,
    name: string | null,
    symbol: string | null,
    decimals: number | null,
    total_supply_raw: string | null,
    total_supply_normalized: string | null,
    network: string,
    collected_at_utc: string
  }
```

---

**`mantle_resolveToken`**

Resolve a token symbol to its address on Mantle. Wraps registry lookup with on-chain verification.

```
Input:
  symbol: z.string()
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    input: string,
    symbol: string,
    address: string,
    decimals: number,
    source: "registry" | "on_chain" | "both",
    confidence: "high" | "medium" | "low",
    network: string
  }
```

---

### 4.5 Indexer Tools

Supports: mantle-data-indexer.

---

**`mantle_querySubgraph`**

Execute a GraphQL query against a Mantle subgraph endpoint.

```
Input:
  endpoint: z.string()                  # subgraph GraphQL URL
  query: z.string()                     # GraphQL query string
  variables: z.record(z.any()).optional()
  timeout_ms: z.number().default(15000)

Output:
  {
    data: any,                          # raw GraphQL response data
    errors: any | null,                 # GraphQL errors if any
    endpoint: string,
    queried_at_utc: string,
    elapsed_ms: number,
    warnings: string[]                  # e.g., "response truncated by pagination limit"
  }
```

---

**`mantle_queryIndexerSql`**

Execute a read-only SQL query against an indexer warehouse.

```
Input:
  endpoint: z.string()                  # SQL indexer API URL
  query: z.string()                     # SQL query string
  params: z.record(z.any()).optional()  # parameterized query values
  timeout_ms: z.number().default(15000)

Output:
  {
    columns: string[],
    rows: any[][],
    row_count: number,
    endpoint: string,
    queried_at_utc: string,
    elapsed_ms: number,
    truncated: boolean,                 # true if result set was capped
    warnings: string[]
  }
```

Security note: The MCP server does not embed indexer credentials. The agent (or its runtime) provides the endpoint URL. The tool executes read-only queries only and rejects any mutation keywords.


### 4.6 DeFi Read Tools

Supports: mantle-risk-evaluator, mantle-defi-operator.

---

**`mantle_getSwapQuote`**

Get a DEX swap quote with price impact estimation. Queries on-chain quoters (Agni V3, Merchant Moe) or aggregator APIs.

```
Input:
  token_in: z.string()                  # address or symbol
  token_out: z.string()                 # address or symbol
  amount_in: z.string()                 # human-readable decimal
  provider: z.enum(["agni", "merchant_moe", "best"]).default("best")
  fee_tier: z.number().optional()       # V3 fee tier (500, 3000, 10000)
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    provider: string,
    token_in: { address: string, symbol: string, decimals: number },
    token_out: { address: string, symbol: string, decimals: number },
    amount_in_raw: string,
    amount_in_decimal: string,
    estimated_out_raw: string,
    estimated_out_decimal: string,
    minimum_out_raw: string,            # after default 0.5% slippage
    minimum_out_decimal: string,
    price_impact_pct: number | null,    # null if unavailable
    route: string,                      # human-readable route description
    router_address: string,
    fee_tier: number | null,
    quoted_at_utc: string,
    warnings: string[]                  # e.g., "high price impact"
  }
```

---

**`mantle_getPoolLiquidity`**

Read liquidity depth and reserve data for a specific DEX pool.

```
Input:
  pool_address: z.string()
  provider: z.enum(["agni", "merchant_moe"]).optional()
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    pool_address: string,
    provider: string,
    token_0: { address: string, symbol: string | null, decimals: number | null },
    token_1: { address: string, symbol: string | null, decimals: number | null },
    reserve_0_raw: string,
    reserve_0_decimal: string | null,
    reserve_1_raw: string,
    reserve_1_decimal: string | null,
    total_liquidity_usd: number | null, # null if price feed unavailable
    fee_tier: number | null,
    collected_at_utc: string
  }
```

---

**`mantle_getLendingMarkets`**

Read lending market data from Mantle lending protocols.

```
Input:
  protocol: z.enum(["lendle", "aurelius", "aave", "all"]).default("all")
  asset: z.string().optional()          # filter by token symbol or address
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    markets: [
      {
        protocol: string,
        asset: string,
        asset_address: string,
        supply_apy: number,             # percentage points (2.3 = 2.3%)
        borrow_apy_variable: number,
        borrow_apy_stable: number | null,
        tvl_usd: number | null,
        ltv: number | null,
        liquidation_threshold: number | null
      }
    ],
    collected_at_utc: string,
    partial: boolean
  }
```

---

### 4.7 Simulation & Debugging Tools

Supports: mantle-tx-simulator, mantle-readonly-debugger, mantle-risk-evaluator, mantle-smart-contract-deployer.

---

**`mantle_simulateTx`**

Simulate a transaction and return state diffs, gas estimate, and success/revert status. Uses `eth_call` with optional state overrides, or a managed simulation API.

```
Input:
  from: z.string()
  to: z.string()
  data: z.string().optional()           # calldata hex
  value: z.string().optional()          # MNT value in wei
  block_tag: z.string().default("latest")
  state_overrides: z.record(z.any()).optional()
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    success: boolean,
    return_data: string | null,         # hex-encoded return data
    gas_used: string,
    gas_estimate: string,               # includes safety margin
    gas_price_wei: string,
    estimated_fee_mnt: string,          # human-readable
    revert_reason: string | null,       # decoded if available
    logs: [
      {
        address: string,
        topics: string[],
        data: string,
        decoded: {                      # null if ABI unknown
          event_name: string,
          args: Record<string, any>
        } | null
      }
    ],
    state_diffs: [                      # simplified balance/allowance diffs
      {
        address: string,
        label: string | null,
        field: string,                  # "balance", "allowance", "storage"
        before: string,
        after: string,
        change: string                  # human-readable delta
      }
    ],
    backend: string,                    # "rpc_eth_call" | "tenderly" | "anvil_fork"
    simulated_at_utc: string,
    network: string
  }
```

---

**`mantle_decodeCalldata`**

Decode transaction calldata into human-readable function call description.

```
Input:
  data: z.string()                      # calldata hex
  abi: z.string().optional()            # JSON ABI string; if omitted, attempts known ABIs
  to: z.string().optional()             # target address; helps ABI lookup from registry

Output:
  {
    function_name: string | null,
    function_signature: string | null,   # e.g., "swap(address,uint256,uint256,bytes)"
    args: Record<string, any> | null,
    raw_selector: string,               # first 4 bytes
    decoded: boolean,
    abi_source: string | null            # "provided" | "registry" | "4byte_directory"
  }
```

---

**`mantle_decodeError`**

Decode revert data or error strings into human-readable explanations.

```
Input:
  error_data: z.string()               # revert data hex, or raw error message string
  abi: z.string().optional()            # custom ABI with error definitions
  context: z.string().optional()        # free-text context (method name, params) for better diagnosis

Output:
  {
    error_type: "revert" | "panic" | "custom_error" | "rpc_error" | "unknown",
    error_name: string | null,          # e.g., "InsufficientBalance"
    error_args: Record<string, any> | null,
    raw_data: string,
    human_explanation: string,          # plain-language explanation
    suggested_actions: string[]         # e.g., ["Check token balance", "Verify allowance"]
  }
```

---

### 4.8 Diagnostics Tools

Supports: mantle-readonly-debugger.

---

**`mantle_checkRpcHealth`**

Check connectivity and responsiveness of an RPC endpoint.

```
Input:
  rpc_url: z.string().optional()        # specific URL to test; defaults to configured endpoint
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    endpoint: string,
    reachable: boolean,
    chain_id: number | null,
    chain_id_matches: boolean | null,   # null if unreachable
    block_number: number | null,
    latency_ms: number | null,
    error: string | null,
    checked_at_utc: string
  }
```

---

**`mantle_probeEndpoint`**

Execute a minimal RPC call against a specific endpoint for diagnostic purposes. Useful when the primary endpoint fails and the debugger skill wants to test alternatives.

```
Input:
  rpc_url: z.string()
  method: z.enum(["eth_chainId", "eth_blockNumber", "eth_getBalance"]).default("eth_blockNumber")
  params: z.array(z.any()).optional()

Output:
  {
    endpoint: string,
    method: string,
    success: boolean,
    result: any | null,
    error: string | null,
    latency_ms: number,
    probed_at_utc: string
  }
```

---

### 4.9 Transaction Building Tools

Supports: mantle-defi-operator, mantle-smart-contract-deployer.

Every transaction-building tool follows the same output contract:
- `unsigned_tx`: the raw transaction fields (to, data, value, gas) ready for external signing
- `simulation`: inline simulation result (success/revert, gas, fee)
- `human_summary`: one-line plain-English description of what this transaction does
- `warnings`: non-empty array if any risk signals detected

The MCP server **never signs or broadcasts**. The agent presents `human_summary` to the user and delegates signing to an external wallet.

---

**`mantle_buildTransferTx`**

Build an unsigned native MNT or ERC-20 transfer transaction.

```
Input:
  from: z.string()
  to: z.string()
  token: z.string().optional()          # token address or symbol; omit for native MNT
  amount: z.string()                    # human-readable decimal
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    unsigned_tx: {
      to: string,
      data: string,
      value: string,
      gas_limit: string,
      chain_id: number
    },
    simulation: {
      success: boolean,
      gas_used: string,
      estimated_fee_mnt: string,
      revert_reason: string | null
    },
    human_summary: string,              # "Transfer 100 USDC to 0xABC...def on Mantle mainnet"
    warnings: string[]
  }
```

---

**`mantle_buildApproveTx`**

Build an unsigned ERC-20 approval transaction.

```
Input:
  from: z.string()
  token: z.string()                     # token address or symbol
  spender: z.string()                   # contract to approve
  amount: z.string().optional()         # human-readable; omit for exact-needed (determined by context)
  unlimited: z.boolean().default(false) # if true, approve max uint256
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    unsigned_tx: { to, data, value, gas_limit, chain_id },
    current_allowance: {
      raw: string,
      normalized: string | null,
      is_unlimited: boolean
    },
    requested_allowance: {
      raw: string,
      normalized: string | null,
      is_unlimited: boolean
    },
    simulation: { success, gas_used, estimated_fee_mnt, revert_reason },
    human_summary: string,              # "Approve Agni Router to spend 100 USDC"
    warnings: string[]                  # e.g., ["Unlimited approval requested"]
  }
```

---

**`mantle_buildSwapTx`**

Build an unsigned DEX swap transaction with inline quote and simulation.

```
Input:
  from: z.string()
  token_in: z.string()
  token_out: z.string()
  amount_in: z.string()                 # human-readable decimal
  slippage_bps: z.number().default(50)  # basis points (50 = 0.5%)
  deadline_seconds: z.number().default(1200)  # 20 minutes
  provider: z.enum(["agni", "merchant_moe", "best"]).default("best")
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    unsigned_tx: { to, data, value, gas_limit, chain_id },
    quote: {
      amount_in_decimal: string,
      estimated_out_decimal: string,
      minimum_out_decimal: string,
      price_impact_pct: number | null,
      route: string,
      provider: string
    },
    approval_needed: {
      needed: boolean,
      token: string | null,
      spender: string | null,
      amount_needed: string | null
    },
    simulation: { success, gas_used, estimated_fee_mnt, revert_reason },
    human_summary: string,              # "Swap 100 WMNT for ~45.2 USDC via Agni (0.5% slippage, 20min deadline)"
    warnings: string[]
  }
```

---

**`mantle_buildLiquidityTx`**

Build an unsigned add-liquidity or remove-liquidity transaction.

```
Input:
  from: z.string()
  action: z.enum(["add", "remove"])
  pool_address: z.string()
  # For add:
  token_a_amount: z.string().optional()
  token_b_amount: z.string().optional()
  # For remove:
  lp_amount: z.string().optional()      # LP token amount to burn
  slippage_bps: z.number().default(50)
  deadline_seconds: z.number().default(1200)
  provider: z.enum(["agni", "merchant_moe"]).optional()
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    unsigned_tx: { to, data, value, gas_limit, chain_id },
    pool_info: {
      token_a: { address, symbol, decimals },
      token_b: { address, symbol, decimals },
      provider: string
    },
    approval_needed: [                  # may need 1-2 approvals
      { needed: boolean, token: string | null, spender: string | null, amount_needed: string | null }
    ],
    simulation: { success, gas_used, estimated_fee_mnt, revert_reason },
    human_summary: string,
    warnings: string[]
  }
```

---

**`mantle_buildDeployTx`**

Build an unsigned contract deployment transaction.

```
Input:
  from: z.string()
  bytecode: z.string()                  # compiled bytecode hex
  constructor_args_encoded: z.string().optional()  # ABI-encoded constructor args
  value: z.string().optional()          # MNT to send with deployment (payable constructor)
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    unsigned_tx: {
      to: null,                         # contract creation
      data: string,                     # bytecode + constructor args
      value: string,
      gas_limit: string,
      chain_id: number
    },
    bytecode_hash: string,              # keccak256 of deployment bytecode
    estimated_address: string | null,   # CREATE address prediction if nonce known
    simulation: { success, gas_used, estimated_fee_mnt, revert_reason },
    human_summary: string,              # "Deploy contract (bytecode 0xABC...def, 34.2KB) on Mantle mainnet"
    warnings: string[]
  }
```

---

### 4.10 Transaction Monitoring Tools

Supports: mantle-defi-operator, mantle-smart-contract-deployer.

---

**`mantle_getTransactionReceipt`**

Fetch the receipt for a mined transaction.

```
Input:
  tx_hash: z.string()
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    tx_hash: string,
    status: "success" | "reverted" | "not_found" | "pending",
    block_number: number | null,
    from: string,
    to: string | null,
    contract_address: string | null,    # non-null for contract creation
    gas_used: string,
    effective_gas_price: string,
    fee_mnt: string,
    logs_count: number,
    logs_decoded: [                     # best-effort decoding
      { event_name: string | null, args: Record<string, any> | null, address: string }
    ],
    explorer_url: string,
    collected_at_utc: string
  }
```

---

**`mantle_waitForReceipt`**

Poll for transaction receipt until confirmation or timeout.

```
Input:
  tx_hash: z.string()
  timeout_ms: z.number().default(60000)
  poll_interval_ms: z.number().default(2000)
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  Same shape as mantle_getTransactionReceipt, plus:
  {
    ...,
    wait_elapsed_ms: number,
    polls: number
  }
```

---

### 4.11 Explorer & Verification Tools

Supports: mantle-smart-contract-deployer.

---

**`mantle_verifyContract`**

Submit contract source verification to a Mantle explorer (Mantlescan or equivalent).

```
Input:
  address: z.string()
  source_code: z.string()               # flattened or standard JSON input
  contract_name: z.string()
  compiler_version: z.string()
  optimization_enabled: z.boolean()
  optimization_runs: z.number().optional()
  constructor_args_encoded: z.string().optional()
  library_addresses: z.record(z.string()).optional()
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    submitted: boolean,
    verification_id: string | null,     # for polling
    explorer: string,                   # e.g., "mantlescan.xyz"
    status: "pending" | "success" | "failed",
    message: string | null,
    submitted_at_utc: string
  }
```

---

**`mantle_checkVerification`**

Poll verification status for a previously submitted verification request.

```
Input:
  verification_id: z.string()
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    verification_id: string,
    status: "pending" | "success" | "failed",
    explorer_url: string | null,        # link to verified source if success
    failure_reason: string | null,
    checked_at_utc: string
  }
```

---

**`mantle_getExplorerUrl`**

Generate a Mantle explorer URL for an address, transaction, or block.

```
Input:
  query: z.string()                     # address, tx hash, or block number
  type: z.enum(["auto", "address", "tx", "block"]).default("auto")
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    url: string,
    type: "address" | "tx" | "block",
    network: string
  }
```

---

### Tool Count Summary

| Category | Tools | Count |
|----------|-------|-------|
| Chain & Network | getChainInfo, getChainStatus | 2 |
| Address Registry | resolveAddress, validateAddress | 2 |
| Account & Balance | getBalance, getTokenBalances, getAllowances | 3 |
| Token | getTokenInfo, resolveToken | 2 |
| Indexer | querySubgraph, queryIndexerSql | 2 |
| DeFi Read | getSwapQuote, getPoolLiquidity, getLendingMarkets | 3 |
| Simulation & Debugging | simulateTx, decodeCalldata, decodeError | 3 |
| Diagnostics | checkRpcHealth, probeEndpoint | 2 |
| Transaction Building | buildTransferTx, buildApproveTx, buildSwapTx, buildLiquidityTx, buildDeployTx | 5 |
| Transaction Monitoring | getTransactionReceipt, waitForReceipt | 2 |
| Explorer & Verification | verifyContract, checkVerification, getExplorerUrl | 3 |
| **Total** | | **29** |

---

## 5. MCP Resources

Resources are read-only data the agent can fetch as context. They do not perform on-chain calls -- they return static or semi-static reference data that skills need for decision-making.

### 5.1 Chain Configuration

```
URI: mantle://chain/mainnet
Name: Mantle Mainnet Configuration
MIME: application/json

Returns:
  {
    chain_id: 5000,
    name: "Mantle",
    native_token: { symbol: "MNT", decimals: 18 },
    rpc_url: "https://rpc.mantle.xyz",
    ws_url: "wss://rpc.mantle.xyz",
    explorer_url: "https://mantlescan.xyz",
    bridge_url: "https://app.mantle.xyz/bridge",
    recommended_solidity_compiler: "v0.8.23 or below",
    wrapped_mnt: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8"
  }
```

```
URI: mantle://chain/sepolia
Name: Mantle Sepolia Testnet Configuration
MIME: application/json

Returns:
  {
    chain_id: 5003,
    name: "Mantle Sepolia",
    native_token: { symbol: "MNT", decimals: 18 },
    rpc_url: "https://rpc.sepolia.mantle.xyz",
    ws_url: null,
    explorer_url: "https://sepolia.mantlescan.xyz",
    bridge_url: "https://app.mantle.xyz/bridge?network=sepolia",
    faucet_urls: [
      "https://faucet.sepolia.mantle.xyz/",
      "https://faucet.quicknode.com/mantle/sepolia",
      "https://thirdweb.com/mantle-sepolia-testnet/faucet"
    ],
    wrapped_mnt: "0x19f5557E23e9914A18239990f6C70D68FDF0deD5"
  }
```

### 5.2 Contract Registry

```
URI: mantle://registry/contracts
Name: Mantle Verified Contract Registry
MIME: application/json

Returns: The same data structure as skills/mantle-address-registry-navigator/assets/registry.json,
         serving as the MCP-accessible mirror of the skill's local registry file.
         Schema: { schema_version, network, updated_at, contracts: [...] }
```

This resource is the MCP equivalent of the skill's `assets/registry.json`. When the mantle-address-registry-navigator skill says "source priority #1: get_contract_address tool", the MCP tool `mantle_resolveAddress` queries this data. When the skill says "source priority #2: local registry file", the agent can alternatively read this resource directly.

### 5.3 Token Registry

```
URI: mantle://registry/tokens
Name: Mantle Token Registry
MIME: application/json

Returns:
  {
    mainnet: {
      "MNT":   { address: "native", decimals: 18, name: "Mantle" },
      "WMNT":  { address: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8", decimals: 18, name: "Wrapped Mantle" },
      "WETH":  { address: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111", decimals: 18, name: "Wrapped Ether" },
      "USDC":  { address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", decimals: 6, name: "USD Coin" },
      "USDT":  { address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE", decimals: 6, name: "Tether" },
      "mETH":  { address: "0xcDA86A272531e8640cD7F1a92c01839911B90bb0", decimals: 18, name: "Mantle Staked ETH" },
      "cmETH": { address: "0xE6829d9a7eE3040e1276Fa75293Bde931859e8fA", decimals: 18, name: "Restaked mETH" },
      ...
    },
    sepolia: { ... }
  }
```

### 5.4 Protocol Registry

```
URI: mantle://registry/protocols
Name: Mantle DeFi Protocol Registry
MIME: application/json

Returns:
  {
    mainnet: {
      "agni": {
        name: "Agni Finance",
        type: "dex",
        contracts: {
          swap_router: "0x319B69888b0d11cEC22caA5034e25FfFBDc88421",
          factory: "0x25780dc8Fc3cfBD75F33bFDAB65e969b603b2035",
          quoter_v2: "0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb"
        }
      },
      "merchant_moe": { ... },
      "lendle": { ... },
      "pendle": { ... },
      "mantle_bridge": {
        name: "Mantle Bridge",
        type: "bridge",
        contracts: {
          standard_bridge_l1: "...",
          standard_bridge_l2: "0x4200000000000000000000000000000000000010",
          ...
        }
      }
    }
  }
```

### 5.5 ABI Registry

```
URI: mantle://abis/{name}
Name: ABI for {name}
MIME: application/json

Available names:
  - erc20
  - agni-router
  - agni-quoter
  - agni-factory
  - merchantmoe-router
  - lendle-pool
  - mantle-bridge
  - permit2
  - multicall3

Returns: Standard JSON ABI array
```

ABIs are used by `mantle_decodeCalldata`, `mantle_decodeError`, and `mantle_simulateTx` for automatic decoding. They are also available directly to agents that need to inspect contract interfaces.

### 5.6 Network Basics Document

```
URI: mantle://docs/network-basics
Name: Mantle Network Basics
MIME: text/markdown

Returns: The content of skills/mantle-network-primer/references/mantle-network-basics.md,
         providing the same factual grounding available to the network primer skill.
```

This resource allows any agent (not just one using the network-primer skill) to access Mantle network fundamentals directly through MCP.

---

## 6. MCP Prompts

Prompts are reusable instruction templates that agents request when starting a specific workflow. Each prompt returns a structured message that guides the agent through the workflow using the appropriate skills and tools.

### 6.1 Portfolio Audit

```
Name: mantle_portfolioAudit
Description: Guide through a complete Mantle wallet audit: balances, allowances, and risk exposure

Arguments:
  - wallet_address (required): The wallet to audit
  - environment (optional, default "mainnet"): mainnet or testnet
  - scope (optional, default "full"): "full", "balances_only", or "allowances_only"

Returns prompt text that instructs the agent to:
  1. Use mantle_getChainInfo to confirm environment
  2. Use mantle_getBalance for native MNT
  3. Use mantle_getTokenBalances for known tokens (from mantle://registry/tokens)
  4. Use mantle_getAllowances for known spenders (from mantle://registry/protocols)
  5. Apply allowance-risk-rules from mantle-portfolio-analyst skill
  6. Format output per the skill's report template
```

### 6.2 Swap Workflow

```
Name: mantle_swapWorkflow
Description: Guide through a safe token swap on Mantle with risk checks

Arguments:
  - token_in (required): Token to sell
  - token_out (required): Token to buy
  - amount (required): Amount to swap
  - from_address (required): Sender wallet

Returns prompt text that instructs the agent to:
  1. Resolve tokens via mantle_resolveToken
  2. Get quote via mantle_getSwapQuote
  3. Run risk evaluation per mantle-risk-evaluator skill
  4. If pass/warn: build tx via mantle_buildSwapTx
  5. Check approval_needed; if true, also build mantle_buildApproveTx
  6. Present human_summary to user for confirmation
  7. After user signs: monitor via mantle_waitForReceipt
  8. Verify post-trade balances via mantle_getTokenBalances
```

### 6.3 Deploy Workflow

```
Name: mantle_deployWorkflow
Description: Guide through contract deployment and verification on Mantle

Arguments:
  - contract_name (required): Contract to deploy
  - environment (required): mainnet or testnet
  - deployer_address (required): Address that will deploy

Returns prompt text that instructs the agent to:
  1. Run deployment-checklist from mantle-smart-contract-deployer skill
  2. Confirm environment via mantle_getChainInfo
  3. Estimate cost via mantle_simulateTx
  4. Build deploy tx via mantle_buildDeployTx
  5. Present human_summary for signing confirmation
  6. After signing: monitor via mantle_waitForReceipt
  7. Submit verification via mantle_verifyContract
  8. Poll via mantle_checkVerification
  9. Return deployment report per skill template
```

### 6.4 Debug Read Failure

```
Name: mantle_debugReadFailure
Description: Guide through structured diagnosis of a read-path failure on Mantle

Arguments:
  - method_or_tool (required): The tool or RPC method that failed
  - error_text (required): The error message or data
  - endpoint (optional): The RPC endpoint that was used

Returns prompt text that instructs the agent to:
  1. Classify error using mantle_decodeError
  2. Check endpoint health via mantle_checkRpcHealth
  3. If RPC issue: probe alternate endpoint via mantle_probeEndpoint
  4. Follow troubleshooting-playbook branching logic from mantle-readonly-debugger skill
  5. Return diagnosis report per skill template
```

### 6.5 Risk Preflight

```
Name: mantle_riskPreflight
Description: Run mandatory pre-execution risk checks for a Mantle transaction intent

Arguments:
  - operation_type (required): swap, add_liquidity, remove_liquidity, transfer, deploy
  - token_in (optional): Input token
  - token_out (optional): Output token
  - amount (optional): Amount
  - target_address (optional): Contract/router/pool address
  - slippage_cap_bps (optional): User's slippage cap in basis points

Returns prompt text that instructs the agent to:
  1. Run each check from mantle-risk-evaluator's risk-checklist
  2. Use mantle_getSwapQuote for slippage/price impact assessment
  3. Use mantle_getPoolLiquidity for depth check
  4. Use mantle_resolveAddress + mantle_validateAddress for address safety
  5. Use mantle_simulateTx for gas sanity check
  6. Use mantle_getAllowances for allowance scope check
  7. Apply risk-threshold-guidance defaults where user caps absent
  8. Return preflight report per skill template with pass/warn/block verdict
```

---

## 7. Error Contract

Every tool returns the same error shape when it cannot produce a valid result. Errors are returned as MCP content with `isError: true`.

### 7.1 Error Response Shape

```typescript
{
  content: [{
    type: "text",
    text: JSON.stringify({
      error: true,
      code: string,                     // machine-readable error code
      message: string,                  // human-readable description
      suggestion: string,               // actionable next step
      details: Record<string, any> | null  // additional context
    })
  }],
  isError: true
}
```

### 7.2 Error Code Catalog

| Code | Meaning | Typical Trigger |
|------|---------|----------------|
| `INVALID_ADDRESS` | Malformed or non-checksummed address | Bad input to any address parameter |
| `ZERO_ADDRESS` | Zero address provided where non-zero required | Transfer/approve to 0x000...000 |
| `ADDRESS_NOT_FOUND` | No registry match for identifier | `mantle_resolveAddress` with unknown key |
| `TOKEN_NOT_FOUND` | Symbol not in registry and not a valid address | `mantle_resolveToken` with unknown symbol |
| `RPC_ERROR` | RPC communication failure | Network timeout, connection refused |
| `RPC_RATE_LIMITED` | RPC endpoint rate limited | HTTP 429 from provider |
| `CHAIN_ID_MISMATCH` | Connected chain ID does not match requested network | RPC misconfiguration |
| `CONTRACT_REVERT` | On-chain call reverted | `mantle_simulateTx`, `mantle_getSwapQuote` |
| `SIMULATION_FAILED` | Transaction simulation could not complete | Backend error in `mantle_simulateTx` |
| `INSUFFICIENT_BALANCE` | Sender balance too low for operation | `mantle_buildTransferTx`, `mantle_buildSwapTx` |
| `APPROVAL_REQUIRED` | ERC-20 allowance insufficient | `mantle_buildSwapTx` (flagged in approval_needed) |
| `POOL_NOT_FOUND` | DEX pool does not exist for pair | `mantle_getPoolLiquidity` |
| `NO_ROUTE` | No swap route found for token pair | `mantle_getSwapQuote` |
| `INDEXER_ERROR` | Indexer query failed | `mantle_querySubgraph`, `mantle_queryIndexerSql` |
| `INDEXER_TIMEOUT` | Indexer query exceeded timeout | Long-running query |
| `VERIFICATION_FAILED` | Explorer verification rejected | `mantle_verifyContract` |
| `DECODE_FAILED` | Unable to decode calldata or error | Unknown ABI/selector |
| `ENDPOINT_UNREACHABLE` | Probed endpoint did not respond | `mantle_probeEndpoint` |
| `UNSUPPORTED_NETWORK` | Requested network not supported | Non-mainnet/sepolia request |
| `TIMEOUT` | Operation timed out | `mantle_waitForReceipt` |

### 7.3 Error Reporting Rules

- Every error includes a `suggestion` field with a concrete next step the agent can take.
- Errors preserve original upstream error strings in `details.raw_error` when available.
- Partial failures (e.g., 3 of 5 token balance reads succeed) return a success response with `partial: true` rather than an error, so the agent can still use the partial data.
- Transient errors (RPC timeout, rate limit) include `details.retryable: true`.

---

## 8. Security Model

### 8.1 Tool Risk Classification

Every tool is classified by its risk level. This classification determines whether the skill should require user confirmation before acting on the tool's output.

| Category | Risk | Tools | User Confirmation? |
|----------|------|-------|-------------------|
| **Read** | None | getChainInfo, getChainStatus, getBalance, getTokenBalances, getAllowances, getTokenInfo, resolveToken, resolveAddress, validateAddress, getSwapQuote, getPoolLiquidity, getLendingMarkets, getTransactionReceipt, getExplorerUrl | No |
| **Query** | Low | querySubgraph, queryIndexerSql | No (but endpoint is agent-provided) |
| **Simulate** | Low | simulateTx, decodeCalldata, decodeError | No |
| **Diagnose** | Low | checkRpcHealth, probeEndpoint | No |
| **Build** | **Medium** | buildTransferTx, buildApproveTx, buildSwapTx, buildLiquidityTx, buildDeployTx | **Yes -- present human_summary** |
| **Monitor** | Low | waitForReceipt | No (read-only polling) |
| **Verify** | Low | verifyContract, checkVerification | No (read-only submission) |

### 8.2 No Private Keys

The MCP server operates with zero access to private keys. The architectural boundary is absolute:

```
MCP Server                          External (out of scope)
─────────────────────────           ─────────────────────────
Read chain state         ───→ OK
Simulate transactions    ───→ OK
Build unsigned payloads  ───→ OK
                                    Sign transaction    ───→ User's wallet
                                    Broadcast tx        ───→ User's wallet
                                    Manage keys         ───→ User's wallet
```

If a future tool needs to interact with a signer (e.g., for gasless meta-transactions), it must delegate to an external signer service via a separate, audited integration point -- never within the MCP server process.

### 8.3 Transaction Building Safety Pipeline

Every `mantle_build*Tx` tool internally executes:

1. **Input validation** -- Reject malformed addresses, negative amounts, missing fields.
2. **Token resolution** -- Resolve symbols to verified addresses via registry. Fail if unresolved.
3. **Simulation** -- Run `eth_call` to verify the transaction would succeed. Include gas estimate.
4. **Risk signal detection** -- Check for: high price impact, excessive gas, approval to non-registry contract, large value transfer.
5. **Human summary generation** -- Produce plain-English description of the operation.
6. **Warning assembly** -- Aggregate all risk signals into `warnings[]`.

The tool returns the unsigned tx, simulation result, human summary, and warnings. The agent (guided by the skill) then decides whether to present to the user or abort based on the skill's guardrails.

### 8.4 Indexer Query Safety

`mantle_querySubgraph` and `mantle_queryIndexerSql` accept external endpoint URLs. Safety measures:

- SQL tool rejects queries containing mutation keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `GRANT`).
- Both tools enforce configurable timeout (`timeout_ms`).
- Neither tool embeds credentials. The agent runtime provides endpoint URLs with any required auth tokens.
- Response size is capped to prevent context window exhaustion.

### 8.5 Address Trust Chain

The trust chain for address verification flows through the registry:

```
Official Mantle docs / Protocol docs
        │
        ▼
mantle://registry/contracts  (MCP Resource, curated by maintainers)
        │
        ▼
mantle_resolveAddress  (tool: lookup + provenance metadata)
        │
        ▼
mantle_validateAddress  (tool: format + on-chain code check)
        │
        ▼
Skill applies mantle-address-registry-navigator rules
        │
        ▼
Agent uses verified address in downstream tool calls
```

An address that does not pass this chain should never be used in transaction-building tools. The mantle-risk-evaluator skill enforces this as a blocking condition.

---

## 9. Configuration

### 9.1 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MANTLE_RPC_URL` | No | `https://rpc.mantle.xyz` | Mainnet RPC endpoint |
| `MANTLE_SEPOLIA_RPC_URL` | No | `https://rpc.sepolia.mantle.xyz` | Sepolia testnet RPC endpoint |
| `MANTLE_RPC_FALLBACK_URL` | No | (none) | Fallback RPC for diagnostics tools |
| `MANTLE_MCP_TRANSPORT` | No | `stdio` | Transport: `stdio` or `http` |
| `MANTLE_MCP_PORT` | No | `3100` | HTTP transport port (ignored for stdio) |
| `MANTLE_EXPLORER_API_KEY` | No | (none) | Mantlescan API key for verification tools |
| `MANTLE_INDEXER_MAX_ROWS` | No | `1000` | Max rows returned by indexer queries |
| `MANTLE_SIMULATION_BACKEND` | No | `rpc` | Simulation backend: `rpc` or `tenderly` |
| `TENDERLY_ACCESS_KEY` | No | (none) | Required if simulation backend is `tenderly` |
| `TENDERLY_PROJECT` | No | (none) | Required if simulation backend is `tenderly` |

### 9.2 MCP Client Configuration

For stdio transport (Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "mantle": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "mantle-mcp/src/index.ts"],
      "env": {
        "MANTLE_RPC_URL": "https://rpc.mantle.xyz",
        "MANTLE_SEPOLIA_RPC_URL": "https://rpc.sepolia.mantle.xyz"
      }
    }
  }
}
```

For HTTP transport (shared/remote):

```json
{
  "mcpServers": {
    "mantle": {
      "type": "http",
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

### 9.3 OpenAI Agents Configuration

Each skill's `agents/openai.yaml` references tools by the `$skill-name` pattern. When the MCP server is connected, the agent runtime maps these to actual MCP tool calls. The skill's `default_prompt` field triggers the skill loading, and the skill's workflow steps drive the tool invocations.

Example flow for OpenAI agents:

```
openai.yaml:
  default_prompt: "Use $mantle-portfolio-analyst to produce a wallet balance and allowance exposure report on Mantle."

Agent runtime:
  1. Loads mantle-portfolio-analyst SKILL.md
  2. Follows workflow steps
  3. Maps tool references to MCP calls:
     "Fetch native balance" → mantle_getBalance
     "Enumerate token balances" → mantle_getTokenBalances
     etc.
```

---

## 10. Relationship to mantle-skills

### 10.1 Separation of Concerns

```
┌─────────────────────────────────────────────┐
│              mantle-skills/                 │
│                                             │
│  skills/                                    │
│    ├── SKILL.md      ← What to think        │
│    ├── references/   ← Domain knowledge      │
│    ├── agents/       ← Agent config          │
│    └── assets/       ← Static data           │
│                                             │
│  specs/                                      │
│    ├── plans.md      ← Architecture vision    │
│    └── mcp-design.md ← This document          │
│                                             │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│              mantle-mcp/                    │
│                                             │
│  src/                                        │
│    ├── tools/        ← What to execute       │
│    ├── resources/    ← What to read          │
│    ├── prompts/      ← How to start          │
│    └── providers/    ← How to connect        │
│                                             │
└─────────────────────────────────────────────┘
```

Skills never import or depend on MCP code. The MCP server never imports skill markdown. The connection is purely at the agent runtime level: the agent loads a skill (brain), then calls MCP tools (muscle) as the skill's workflow directs.

### 10.2 How Skills Reference Tools

Skills reference MCP tools indirectly through workflow descriptions. They do not use formal tool binding syntax. Instead, they describe the action needed and the agent maps it to the available tool:

| Skill says | Agent calls |
|-----------|------------|
| "Fetch native balance" | `mantle_getBalance` |
| "Resolve token addresses via trusted registry" | `mantle_resolveAddress` |
| "Query preferred aggregator/DEX route" | `mantle_getSwapQuote` |
| "Execute simulation" | `mantle_simulateTx` |
| "Submit deployment transaction" | `mantle_buildDeployTx` (unsigned) |

This indirection is intentional: skills remain tool-agnostic, and the same skill can work with different MCP implementations as long as the tool semantics match.

### 10.3 Skill-to-Tool Installation Dependency

Skills can function in degraded mode without the MCP server (answering knowledge questions, providing guidance), but they cannot perform on-chain operations. The recommended installation includes both:

```bash
# Install skills (brain)
npx skills add mantle/mantle-skills

# Configure MCP server (muscle)
# Add to .cursor/mcp.json, .claude/mcp.json, or equivalent
```

### 10.4 Lifecycle and Versioning

Skills and the MCP server version independently:

- **Skill changes** (new workflow steps, stricter guardrails, updated reference docs) do not require MCP server updates, as long as the needed tool semantics remain stable.
- **MCP tool changes** (new parameters, expanded output fields, new tools) do not require skill updates, as skills reference tools by intent rather than exact schema.
- **Breaking changes** (tool removal, semantic change in output) require coordinated updates. The MCP server should maintain backward-compatible output shapes and deprecate gracefully.

### 10.5 Registry Data Synchronization

The contract registry exists in two places:
1. `skills/mantle-address-registry-navigator/assets/registry.json` -- local to the skill
2. `mantle://registry/contracts` MCP Resource -- served by the MCP server

These must stay synchronized. The recommended approach:
- The MCP resource reads from a shared data file (e.g., `config/registry.json` in the MCP server).
- A CI job validates that the skill's `assets/registry.json` and the MCP server's `config/registry.json` contain identical data.
- Updates flow: official source -> shared data file -> CI validates both consumers.

---

## Appendix: Complete Tool Quick Reference

| # | Tool | Category | Primary Skill Consumer |
|---|------|----------|----------------------|
| 1 | `mantle_getChainInfo` | Chain | network-primer, portfolio-analyst, deployer |
| 2 | `mantle_getChainStatus` | Chain | network-primer |
| 3 | `mantle_resolveAddress` | Registry | address-registry-navigator, risk-evaluator, defi-operator |
| 4 | `mantle_validateAddress` | Registry | address-registry-navigator, risk-evaluator |
| 5 | `mantle_getBalance` | Account | portfolio-analyst, tx-simulator, defi-operator |
| 6 | `mantle_getTokenBalances` | Account | portfolio-analyst, tx-simulator, defi-operator |
| 7 | `mantle_getAllowances` | Account | portfolio-analyst, risk-evaluator, defi-operator |
| 8 | `mantle_getTokenInfo` | Token | defi-operator, portfolio-analyst |
| 9 | `mantle_resolveToken` | Token | defi-operator, risk-evaluator |
| 10 | `mantle_querySubgraph` | Indexer | data-indexer |
| 11 | `mantle_queryIndexerSql` | Indexer | data-indexer |
| 12 | `mantle_getSwapQuote` | DeFi Read | risk-evaluator, defi-operator |
| 13 | `mantle_getPoolLiquidity` | DeFi Read | risk-evaluator |
| 14 | `mantle_getLendingMarkets` | DeFi Read | (future lending skills) |
| 15 | `mantle_simulateTx` | Simulation | tx-simulator, risk-evaluator, deployer |
| 16 | `mantle_decodeCalldata` | Simulation | tx-simulator |
| 17 | `mantle_decodeError` | Simulation | tx-simulator, readonly-debugger |
| 18 | `mantle_checkRpcHealth` | Diagnostics | readonly-debugger |
| 19 | `mantle_probeEndpoint` | Diagnostics | readonly-debugger |
| 20 | `mantle_buildTransferTx` | Tx Build | defi-operator |
| 21 | `mantle_buildApproveTx` | Tx Build | defi-operator |
| 22 | `mantle_buildSwapTx` | Tx Build | defi-operator |
| 23 | `mantle_buildLiquidityTx` | Tx Build | defi-operator |
| 24 | `mantle_buildDeployTx` | Tx Build | smart-contract-deployer |
| 25 | `mantle_getTransactionReceipt` | Tx Monitor | defi-operator, deployer |
| 26 | `mantle_waitForReceipt` | Tx Monitor | defi-operator, deployer |
| 27 | `mantle_verifyContract` | Explorer | smart-contract-deployer |
| 28 | `mantle_checkVerification` | Explorer | smart-contract-deployer |
| 29 | `mantle_getExplorerUrl` | Explorer | smart-contract-deployer |
