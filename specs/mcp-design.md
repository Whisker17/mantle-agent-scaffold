# Mantle Skills MCP Server - Design Spec

> MCP server design that provides the runtime execution layer for the 9 mantle-skills.
> Skills define what the agent should think and decide; this MCP server provides the stateless tools the agent calls to read chain state, simulate transactions, and build unsigned payloads.

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Server Instructions](#2-server-instructions)
3. [Architecture](#3-architecture)
4. [Skill-to-Tool Mapping Matrix](#4-skill-to-tool-mapping-matrix)
5. [Tool Catalog](#5-tool-catalog)
6. [MCP Resources](#6-mcp-resources)
7. [MCP Prompts](#7-mcp-prompts)
8. [Error Contract](#8-error-contract)
9. [Security Model](#9-security-model)
10. [Configuration](#10-configuration)
11. [Relationship to mantle-skills](#11-relationship-to-mantle-skills)
12. [Future Audit Backlog](#12-future-audit-backlog)
13. [Release Tracking Snapshot](#13-release-tracking-snapshot)

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

**T1. Stateless tools.** Every MCP tool is a pure function: same input + same on-chain state + same token-list snapshot produces same output. No session state, no user memory, no accumulated context between tool calls.

**T2. Skills orchestrate, tools execute.** A tool never decides *whether* to proceed -- it does what the skill asks and reports what happened. Risk decisions, confirmation gates, and workflow branching live in skills.

**T3. Fail closed.** When a tool cannot produce a trustworthy result, it returns a typed error with a suggestion. It never returns fabricated data, approximate addresses, or optimistic estimates.

**T4. Unsigned only.** Transaction-building tools return unsigned payloads. The MCP server never holds private keys, never signs, and never broadcasts. Signing happens outside the scaffold entirely.

**T5. Human summary mandatory.** Every transaction-building tool returns a `human_summary` field -- a plain-language description of what the transaction will do. Skills present this to the user for confirmation before any signing step.

**T6. MNT-native.** Gas estimates, fee calculations, and native balances are denominated in MNT. ETH values appear only when ETH is the actual asset in context (e.g., mETH staking on L1).

---

## 2. Server Instructions

When an AI agent connects to the MCP server, the server's instructions are the **first guidance the agent receives**. This section defines two complementary instruction surfaces.

### 2.1 `mcp.serverUseInstructions` (package.json)

A single-string field in `package.json` that MCP-aware agent runtimes read on connection. It must be concise (one paragraph) and encode the most critical behavioral rules.

```json
{
  "mcp": {
    "serverUseInstructions": "Mantle L2 chain tools. Gas token is MNT, not ETH. CRITICAL RULES: (1) NEVER hold or request private keys - all transaction tools return unsigned payloads only. (2) ALWAYS call mantle_resolveAddress or mantle_resolveToken to verify addresses before using them in transaction-building tools; for token symbols, mantle_resolveToken must double-check against https://token-list.mantle.xyz. (3) ALWAYS ensure a fresh simulation result before presenting a transaction for signing (for mantle_build*Tx, use the returned simulation field; use mantle_simulateTx for custom calldata or re-simulation). (4) ALWAYS present the human_summary field to the user and obtain explicit confirmation before any signing step. (5) Gas estimates and native balances are in MNT. (6) When an address cannot be resolved through the registry, STOP and ask the user rather than proceeding with an unverified address."
  }
}
```

### 2.2 `SERVER_INSTRUCTIONS.md`

A standalone markdown file shipped with the package (included in `files[]`). Agent runtimes that support extended instructions (Claude, Cursor) read this file for deeper context. The content below is the spec for this file.

```markdown
# mantle-mcp Server Instructions

Mantle L2 tools for AI agents. Read chain state, simulate transactions, build unsigned payloads.

---

## RULES (Will Break Things If Ignored)

### 1. Never Hold Private Keys

mantle-mcp NEVER signs or broadcasts. All `mantle_build*Tx` tools return unsigned
transaction objects. Signing is the user's responsibility via their own wallet.

### 2. Verify Addresses Through the Registry

ALWAYS resolve addresses before use:

  mantle_resolveAddress({ identifier: "USDC", network: "mainnet" })
  → { address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", confidence: "high" }

NEVER pass user-provided raw addresses directly into transaction-building tools
without first validating them through mantle_validateAddress.

For token symbols, treat Quick Reference addresses as convenience only:
- First resolve via `mantle_resolveToken`
- `mantle_resolveToken` MUST double-check embedded quick-reference entries against the Mantle token list (`https://token-list.mantle.xyz`)
- If quick-reference and token-list values mismatch, STOP with a typed error

Risk-tier behavior when token-list is unavailable:
- Transaction-building tools (`mantle_build*Tx`): hard error `TOKEN_LIST_UNAVAILABLE`
- Read-only tools: allow degraded response with low confidence + explicit warning

### 3. Simulate Before Presenting

ALWAYS ensure a simulation result before presenting a transaction to the user:

- For `mantle_build*Tx`, use the `simulation` field returned by the build tool
  (build tools simulate internally).
- Use `mantle_simulateTx` when calldata is externally provided, when you need
  re-simulation after state changes, or when debugging.

If simulation fails, report the revert reason. Do NOT proceed.

### 4. Present human_summary Before Signing

Every `mantle_build*Tx` tool returns a `human_summary` field. You MUST show this to
the user and get explicit confirmation before they sign. This is the WYSIWYS principle
(What You See Is What You Sign).

### 5. MNT is the Gas Token

Mantle uses MNT (not ETH) for gas. All gas estimates and native balances are in MNT.
ETH only appears when it is the actual asset (e.g., WETH, mETH).

- Mantle Mainnet: Chain ID 5000, native token MNT
- Mantle Sepolia: Chain ID 5003, native token MNT

### 6. Never Fabricate Data

If a tool returns an error, report it. Never make up:
- Token addresses or contract addresses
- Balance amounts or price quotes
- Gas estimates

### 7. Slippage and Deadline Defaults

Unless the user specifies otherwise:
- Slippage: 50 bps (0.5%)
- Deadline: 1200 seconds (20 minutes)

If price impact exceeds 1%, WARN the user. If it exceeds 5%, REFUSE to proceed.

### 8. Allowance Hygiene

When building swap or liquidity transactions:
- Check the `approval_needed` field in the response
- If approval is needed, build and present the approve tx FIRST
- NEVER request unlimited approvals unless the user explicitly asks

---

## Quick Reference

| Network        | Chain ID | RPC                              | Explorer                    |
|----------------|----------|----------------------------------|-----------------------------|
| Mantle Mainnet | 5000     | https://rpc.mantle.xyz           | https://mantlescan.xyz      |
| Mantle Sepolia | 5003     | https://rpc.sepolia.mantle.xyz   | https://sepolia.mantlescan.xyz |

| Key Token | Address (Mainnet)                            | Decimals |
|-----------|----------------------------------------------|----------|
| WMNT      | 0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8  | 18       |
| WETH      | 0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111  | 18       |
| USDC      | 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9  | 6        |
| USDT      | 0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE  | 6        |
| mETH      | 0xcDA86A272531e8640cD7F1a92c01839911B90bb0  | 18       |
| cmETH     | 0xE6829d9a7eE3040e1276Fa75293Bde931859e8fA  | 18       |

Quick Reference is a pinned fast path only. Before any transaction-building call, token addresses must be re-confirmed by `mantle_resolveToken` with token-list cross-check.

---

## Tool Categories

| Category          | Risk    | User Confirmation? |
|-------------------|---------|--------------------|
| Read tools        | None    | No                 |
| Query tools       | Low     | No                 |
| Simulate tools    | Low     | No                 |
| Diagnose tools    | Low     | No                 |
| Build tools       | Medium  | YES - human_summary |
| Monitor tools     | Low     | No                 |

---

## Common Workflows

### Balance Check
1. mantle_getChainInfo → confirm network
2. mantle_getBalance → native MNT
3. mantle_getTokenBalances → ERC-20 tokens

### Token Swap
1. mantle_resolveToken → verify both tokens
2. mantle_getSwapQuote → get quote + price impact
3. mantle_buildSwapTx → unsigned tx + human_summary
4. Present human_summary → user signs externally
5. mantle_waitForReceipt → confirm execution

### Transfer
1. mantle_resolveAddress or mantle_resolveToken → verify recipient and token
2. mantle_buildTransferTx → unsigned tx + human_summary
3. Present human_summary → user signs externally
4. mantle_getTransactionReceipt → confirm
```

---

## 3. Architecture

### 3.1 Three-Layer Pattern

```
┌─────────────────────────────────────────────────┐
│                Transport Layer                  │
│   stdio (local agents)  |  HTTP/SSE (remote)    │
│   Connection lifecycle, JSON-RPC framing        │
├─────────────────────────────────────────────────┤
│                Protocol Layer                   │
│   @modelcontextprotocol/sdk  Server class       │
│   setRequestHandler for each schema             │
│   Tool / Resource / Prompt dispatch             │
│   Input validation, output serialization        │
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

### 3.2 Dual Transport

| Transport | Use Case | Client Example |
|-----------|----------|---------------|
| stdio | Local agents (Claude Code, Cursor, OpenAI agents) | `npx mantle-mcp` |
| Streamable HTTP + SSE | Remote or web-based agents, shared team servers | `http://localhost:3100/mcp` |

The server entrypoint selects transport via the `MANTLE_MCP_TRANSPORT` environment variable. Both transports expose the identical tool/resource/prompt surface.

### 3.3 Package Specification

```json
{
  "name": "mantle-mcp",
  "version": "0.1.0",
  "description": "MCP server for AI-driven Mantle L2 development - chain reads, simulation, and unsigned transaction building",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "mantle-mcp": "dist/index.js"
  },
  "files": [
    "dist",
    "SERVER_INSTRUCTIONS.md",
    "README.md"
  ],
  "mcp": {
    "serverUseInstructions": "Mantle L2 chain tools. Gas token is MNT, not ETH. CRITICAL RULES: (1) NEVER hold or request private keys - all transaction tools return unsigned payloads only. (2) ALWAYS call mantle_resolveAddress or mantle_resolveToken to verify addresses before using them in transaction-building tools; for token symbols, mantle_resolveToken must double-check against https://token-list.mantle.xyz. (3) ALWAYS ensure a fresh simulation result before presenting a transaction for signing (for mantle_build*Tx, use the returned simulation field; use mantle_simulateTx for custom calldata or re-simulation). (4) ALWAYS present the human_summary field to the user and obtain explicit confirmation before any signing step. (5) Gas estimates and native balances are in MNT. (6) When an address cannot be resolved through the registry, STOP and ask the user rather than proceeding with an unverified address."
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "viem": "^2.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

Key design decisions:
- `"type": "module"` -- ESM-only, matching the MCP SDK's module system.
- `"bin"` -- enables `npx mantle-mcp` for zero-install usage in agent configs.
- Single dependency on `viem` for all chain interaction -- no ethers.js, no web3.js.
- `mcp.serverUseInstructions` -- read by MCP-aware runtimes on connection (see section 2).

### 3.4 Server Wiring Pattern

The server uses the `Server` class from `@modelcontextprotocol/sdk` with explicit request handlers, following the pattern proven by eth-mcp. This approach gives full control over tool dispatch, error wrapping, and response serialization.

**Entry point (`src/index.ts`):**

```typescript
import { runServer } from "./server.js";

runServer().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
```

**Server setup (`src/server.ts`):**

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { chainTools } from "./tools/chain.js";
import { registryTools } from "./tools/registry.js";
import { accountTools } from "./tools/account.js";
import { tokenTools } from "./tools/token.js";
import { indexerTools } from "./tools/indexer.js";
import { defiReadTools } from "./tools/defi-read.js";
import { simulationTools } from "./tools/simulation.js";
import { diagnosticsTools } from "./tools/diagnostics.js";
import { txBuildTools } from "./tools/tx-build.js";
import { txMonitorTools } from "./tools/tx-monitor.js";
import { explorerTools } from "./tools/explorer.js";
import { listResources, readResource, prefetchResources } from "./resources.js";
import { prompts, getPromptMessages } from "./prompts.js";

interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

// Merge all tool modules into a flat lookup
const allTools: Record<string, Tool> = {
  ...Object.fromEntries(
    Object.entries(chainTools).map(([_, t]) => [t.name, t as Tool])
  ),
  ...Object.fromEntries(
    Object.entries(registryTools).map(([_, t]) => [t.name, t as Tool])
  ),
  ...Object.fromEntries(
    Object.entries(accountTools).map(([_, t]) => [t.name, t as Tool])
  ),
  // ... repeat for all tool modules
};

export function createServer(): Server {
  const server = new Server(
    { name: "mantle-mcp", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  // --- Tool handlers ---
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.values(allTools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = allTools[name];
    if (!tool) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
        isError: true,
      };
    }
    try {
      const result = await tool.handler(args || {});
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error }) }],
        isError: true,
      };
    }
  });

  // --- Resource handlers ---
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listResources(),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const result = readResource(uri);
    if (!result) {
      return {
        contents: [{ uri, mimeType: "text/plain", text: `Resource not found: ${uri}` }],
      };
    }
    return {
      contents: [{ uri, mimeType: result.mimeType, text: result.content }],
    };
  });

  // --- Prompt handlers ---
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: prompts.map((p) => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments,
    })),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name } = request.params;
    const messages = getPromptMessages(name);
    if (!messages) throw new Error(`Prompt not found: ${name}`);
    return { messages };
  });

  return server;
}

export async function runServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  prefetchResources().catch(() => {});

  await server.connect(transport);

  process.on("SIGINT", async () => { await server.close(); process.exit(0); });
  process.on("SIGTERM", async () => { await server.close(); process.exit(0); });
}
```

Key patterns adopted from eth-mcp:
- **Flat tool merge**: Each domain module exports a `Record<string, Tool>`. `server.ts` merges them into a single `allTools` lookup for O(1) dispatch.
- **Uniform error wrapping**: The `CallToolRequestSchema` handler catches all exceptions and returns `{ isError: true }` with a JSON error body. Individual tool handlers throw typed errors (see section 8).
- **Prefetch on startup**: `prefetchResources()` pre-caches any remote or computed resources before the first client request.
- **Graceful shutdown**: SIGINT/SIGTERM handlers close the server cleanly.

### 3.5 Server Lifecycle

```
Startup:
  1. Transport selection (stdio or HTTP based on MANTLE_MCP_TRANSPORT)
  2. prefetchResources() -- pre-cache network basics doc, remote ABIs if any
  3. server.connect(transport) -- begin accepting requests

Runtime:
  - All tool calls are stateless: create viem client per request (or use lazy singleton)
  - Resources are served from in-memory data (registries, docs)
  - No session state between tool invocations

Shutdown (SIGINT / SIGTERM):
  1. server.close() -- drain pending requests
  2. process.exit(0)
```

`prefetchResources()` silently handles failures -- if remote content is unavailable at startup, resources fall back to bundled data and retry on first access.

### 3.6 Data Embedding Strategy

Use a hybrid strategy:
- **Embedded quick-reference data** in TypeScript for zero-config startup and deterministic fallback.
- **Canonical token-list cross-check** from Mantle token list for runtime validation.

This keeps `npx` usability while adding a second validation source for token resolution.

**Token registry (`src/config/tokens.ts`):**

```typescript
export const MANTLE_TOKENS = {
  mainnet: {
    MNT:   { address: "native", decimals: 18, name: "Mantle", symbol: "MNT" },
    WMNT:  { address: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8", decimals: 18, name: "Wrapped Mantle", symbol: "WMNT" },
    WETH:  { address: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111", decimals: 18, name: "Wrapped Ether", symbol: "WETH" },
    USDC:  { address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", decimals: 6, name: "USD Coin", symbol: "USDC" },
    USDT:  { address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE", decimals: 6, name: "Tether", symbol: "USDT" },
    mETH:  { address: "0xcDA86A272531e8640cD7F1a92c01839911B90bb0", decimals: 18, name: "Mantle Staked ETH", symbol: "mETH" },
    cmETH: { address: "0xE6829d9a7eE3040e1276Fa75293Bde931859e8fA", decimals: 18, name: "Restaked mETH", symbol: "cmETH" },
    // ... additional tokens
  },
  sepolia: { /* ... */ },
} as const;
```

**Token resolution policy (double-check):**

1. Resolve symbol from embedded `MANTLE_TOKENS` quick-reference map.
2. Fetch canonical token list from `MANTLE_TOKEN_LIST_URL` (default `https://token-list.mantle.xyz`).
3. Compare address and decimals.
4. If mismatch, return `TOKEN_REGISTRY_MISMATCH` and fail closed.
5. If token list is temporarily unavailable:
   - Transaction-building paths (`mantle_build*Tx`): return `TOKEN_LIST_UNAVAILABLE` and refuse to build.
   - Read-only paths: return downgraded confidence with explicit warning.

**Token Canonicalization Rules:**

| Symbol Class | Registry Representation | Token-List Representation | Match Rule |
|--------------|-------------------------|---------------------------|------------|
| Native token | `"native"` | May be absent | Skip token-list match; native token is trusted by chain config |
| Wrapped native | Explicit address | Explicit address | Strict address + decimals equality |
| Bridged tokens | Explicit address | Explicit address | Strict address + decimals equality |
| Pseudo-address tokens | Chain-specific pseudo address (e.g. Mantle WETH) | Same or absent | Address equality when present; if absent, allow only via explicit exception allowlist |

Canonicalization exceptions live in `src/config/token-canonicalization.ts`. Each exception requires a comment with an authoritative source URL. CI enforces an allowlist cap (default: 5 entries) to prevent policy drift.

**Protocol registry (`src/config/protocols.ts`):**

```typescript
export const MANTLE_PROTOCOLS = {
  mainnet: {
    agni: {
      name: "Agni Finance",
      type: "dex",
      contracts: {
        swap_router: "0x319B69888b0d11cEC22caA5034e25FfFBDc88421",
        factory: "0x25780dc8Fc3cfBD75F33bFDAB65e969b603b2035",
        quoter_v2: "0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb",
      },
    },
    merchant_moe: { /* ... */ },
    ondo: {
      name: "Ondo Finance",
      type: "rwa",
      status: "planned",                // post-v1 target; not enabled in first release
      contracts: {
        router: "BLOCKER: fill from Ondo official docs and verify on Mantlescan",
        vault_manager: "BLOCKER: fill from Ondo official docs and verify on Mantlescan",
      },
    },
    aave_v3: {
      name: "Aave V3",
      type: "lending",
      contracts: {
        pool: "BLOCKER: fill from Aave V3 deployed contracts docs and verify on Mantlescan",
        pool_data_provider: "BLOCKER: fill from Aave V3 deployed contracts docs and verify on Mantlescan",
        pool_addresses_provider: "BLOCKER: fill from Aave V3 deployed contracts docs and verify on Mantlescan",
      },
    },
    // ...
  },
} as const;
```

Release scope note:
- **v1 enabled DeFi protocols:** `agni`, `merchant_moe`, `aave_v3`.
- **Deferred (post-v1):** `ondo` (planned only, not executable in first release).

Address policy:
- Aave V3 addresses must be sourced from canonical references (official docs as primary, Mantlescan verification as secondary confirmation).
- Ondo addresses may be tracked as planned placeholders, but Ondo execution paths remain disabled until a later version.
- CI must fail if enabled protocol entries contain `BLOCKER:` placeholders.

**ABI registry (`src/abis/index.ts`):**

```typescript
import { erc20Abi } from "./erc20.js";
import { agniRouterAbi } from "./agni-router.js";
import { agniQuoterAbi } from "./agni-quoter.js";
import { aavePoolAbi } from "./aave-v3-pool.js";
// ...

const ABI_MAP: Record<string, readonly unknown[]> = {
  erc20: erc20Abi,
  "agni-router": agniRouterAbi,
  "agni-quoter": agniQuoterAbi,
  "aave-v3-pool": aavePoolAbi,
  // ...
};

export function getAbiByName(name: string): readonly unknown[] | null {
  return ABI_MAP[name] ?? null;
}

export function listAbiNames(): string[] {
  return Object.keys(ABI_MAP);
}
```

**CI synchronization**: CI must validate registry parity, token quick-reference parity with the pinned token-list snapshot, protocol completeness, ABI presence for declared tools, and absence of any `BLOCKER:` placeholders (see section 11.5). Any mismatch fails the build with a diff report.

### 3.7 Proposed Directory Structure

```
mantle-mcp/
├── src/
│   ├── index.ts                    # Entrypoint: transport selection
│   ├── server.ts                   # Protocol layer: Server setup, handler registration
│   ├── resources.ts                # Resource definitions, readResource(), prefetchResources()
│   ├── prompts.ts                  # Prompt definitions, getPromptMessages()
│   ├── tools/
│   │   ├── index.ts                # Re-exports all tool modules
│   │   ├── chain.ts                # mantle_getChainInfo, mantle_getChainStatus
│   │   ├── registry.ts             # mantle_resolveAddress, mantle_validateAddress
│   │   ├── account.ts              # mantle_getBalance, mantle_getTokenBalances, mantle_getAllowances
│   │   ├── token.ts                # mantle_getTokenInfo, mantle_resolveToken
│   │   ├── indexer.ts              # mantle_querySubgraph, mantle_queryIndexerSql
│   │   ├── defi-read.ts            # mantle_getSwapQuote, mantle_getPoolLiquidity, mantle_getLendingMarkets
│   │   ├── simulation.ts           # mantle_simulateTx, mantle_decodeCalldata, mantle_decodeError
│   │   ├── diagnostics.ts          # mantle_checkRpcHealth, mantle_probeEndpoint
│   │   ├── tx-build.ts             # mantle_buildTransferTx, mantle_buildApproveTx, mantle_buildSwapTx,
│   │   │                           # mantle_buildLiquidityTx, mantle_buildLendingTx, mantle_buildDeployTx
│   │   ├── tx-monitor.ts           # mantle_getTransactionReceipt, mantle_waitForReceipt
│   │   └── explorer.ts             # mantle_verifyContract, mantle_checkVerification, mantle_getExplorerUrl
│   ├── config/
│   │   ├── chains.ts               # Chain definitions (mainnet, sepolia)
│   │   ├── tokens.ts               # Embedded token registry
│   │   ├── protocols.ts            # Embedded protocol contract addresses
│   │   └── abis.ts                 # ABI map re-exports
│   ├── abis/
│   │   ├── index.ts                # ABI lookup: getAbiByName(), listAbiNames()
│   │   ├── erc20.ts
│   │   ├── agni-router.ts
│   │   ├── agni-quoter.ts
│   │   ├── agni-factory.ts
│   │   ├── merchantmoe-router.ts
│   │   ├── ondo-vault.ts            # (future) Ondo ABI, post-v1
│   │   ├── mantle-bridge.ts
│   │   └── multicall3.ts
│   ├── providers/
│   │   ├── rpc.ts                  # viem client factory, multicall batching
│   │   ├── agni.ts                 # Agni Finance quoter reads
│   │   ├── merchantmoe.ts          # Merchant Moe quoter reads
│   │   ├── ondo.ts                 # (future) Ondo protocol reads, post-v1
│   │   ├── indexer.ts              # Subgraph / SQL indexer client
│   │   └── explorer-api.ts         # Mantlescan verification API
│   └── utils/
│       ├── format.ts               # BigInt serialization, amount formatting
│       ├── errors.ts               # Typed error builder (MantleMcpError class)
│       └── validation.ts           # Address checksum, input normalization
├── tests/
│   ├── tools/                      # Per-tool unit tests
│   ├── providers/                  # Provider integration tests
│   └── fixtures/                   # Mock RPC responses
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── SERVER_INSTRUCTIONS.md
└── README.md
```

### 3.8 How an Agent Uses Skills + MCP Together

```
User: "What's the USDC balance of 0xABC... on Mantle?"

Agent loads: mantle-portfolio-analyst SKILL.md
  → Workflow step 1: "Confirm inputs" → wallet_address = 0xABC..., network = mainnet
  → Workflow step 2: "Resolve network RPC" → Agent calls mantle_getChainInfo(network: "mainnet")
  → Workflow step 3: "Fetch native balance" → Agent calls mantle_getBalance(address: "0xABC...", network: "mainnet")
  → Workflow step 4: "Enumerate token balances" → Agent calls mantle_getTokenBalances(address: "0xABC...", tokens: ["USDC"], network: "mainnet")
  → Workflow step 5: "Enumerate allowances" → Agent calls mantle_getAllowances(owner: "0xABC...", pairs: [{ token: "USDC", spender: "0x319B69888b0d11cEC22caA5034e25FfFBDc88421" }], network: "mainnet")
  → Workflow step 6: "Classify risk" → Agent applies allowance-risk-rules.md logic internally
  → Workflow step 7: "Return formatted report" → Agent formats output per skill template
```

The skill provides the reasoning structure. The MCP tools provide the data.

---

## 4. Skill-to-Tool Mapping Matrix

This matrix maps every skill workflow step to the MCP tools it requires. Tool names prefixed with `mantle_` are defined in section 5. Resource URIs prefixed with `mantle://` are defined in section 6.

### 4.1 mantle-network-primer

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Load Mantle basics | Resource: `mantle://docs/network-basics` |
| Answer chain config questions | `mantle_getChainInfo` |
| Answer live status questions | `mantle_getChainStatus` |
| Cross-check contract addresses | `mantle_resolveAddress` |

### 4.2 mantle-address-registry-navigator

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Source priority #1: get_contract_address tool | `mantle_resolveAddress` |
| Source priority #2: local registry file | Resource: `mantle://registry/contracts` |
| Validate EIP-55 checksum and not zero-address | `mantle_validateAddress` |
| Verify entry provenance | Embedded in `mantle_resolveAddress` response |

### 4.3 mantle-portfolio-analyst

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Resolve environment RPC and chain ID | `mantle_getChainInfo` |
| Fetch native MNT balance | `mantle_getBalance` |
| Enumerate token balances (batch) | `mantle_getTokenBalances` |
| Fetch token metadata (decimals, symbol) | `mantle_getTokenInfo` |
| Compute token valuation (USD/MNT) | `mantle_getTokenPrices` |
| Enumerate allowances (batch) | `mantle_getAllowances` |
| Discover known tokens/spenders | Resource: `mantle://registry/tokens`, `mantle://registry/protocols` |

### 4.4 mantle-data-indexer

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Execute GraphQL query against subgraph | `mantle_querySubgraph` |
| Execute SQL query against indexer warehouse | `mantle_queryIndexerSql` |

### 4.5 mantle-risk-evaluator

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Slippage check (need quote for price impact) | `mantle_getSwapQuote` |
| Liquidity depth check | `mantle_getPoolLiquidity` |
| Normalize reserves to USD when pool USD is missing | `mantle_getTokenPrices` |
| Address safety check | `mantle_resolveAddress`, `mantle_validateAddress` |
| Gas and deadline sanity | Build-tool inline `simulation`; `mantle_simulateTx` for standalone/re-simulation |
| Allowance scope check | `mantle_getAllowances` |

### 4.6 mantle-tx-simulator

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Capture pre-state (balances, allowances) | `mantle_getBalance`, `mantle_getTokenBalances`, `mantle_getAllowances` |
| Execute simulation | `mantle_simulateTx` |
| Decode calldata for human display | `mantle_decodeCalldata` |
| Decode revert reason on failure | `mantle_decodeError` |
| Construct WYSIWYS summary | Agent applies `references/wysiwys-template.md` to `mantle_simulateTx` output |

### 4.7 mantle-readonly-debugger

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Check RPC endpoint health | `mantle_checkRpcHealth` |
| Probe alternate endpoint | `mantle_probeEndpoint` |
| Classify error signature | `mantle_decodeError` |
| Re-run failing read for reproduction | Any relevant read tool (context-dependent) |

### 4.8 mantle-smart-contract-deployer

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Confirm environment and chain ID | `mantle_getChainInfo` |
| Estimate deployment gas and cost | `mantle_simulateTx` |
| Build deployment transaction | `mantle_buildDeployTx` |
| Monitor deployment receipt | `mantle_getTransactionReceipt`, `mantle_waitForReceipt` |
| Submit source verification | `mantle_verifyContract` |
| Poll verification status | `mantle_checkVerification` |
| Get explorer URL for deployed contract | `mantle_getExplorerUrl` |

### 4.9 mantle-defi-operator

| Workflow Step | MCP Tool / Resource |
|---------------|-------------------|
| Resolve token metadata (decimals, symbol) | `mantle_getTokenInfo`, `mantle_resolveToken` |
| Get swap quote and route | `mantle_getSwapQuote` |
| Read lending market context (Aave V3) | `mantle_getLendingMarkets` |
| Check current allowance | `mantle_getAllowances` |
| Build approve transaction | `mantle_buildApproveTx` |
| Build swap transaction | `mantle_buildSwapTx` |
| Build add/remove liquidity transaction | `mantle_buildLiquidityTx` |
| Build lending tx (supply/withdraw/borrow/repay) | `mantle_buildLendingTx` |
| Monitor execution receipt | `mantle_getTransactionReceipt`, `mantle_waitForReceipt` |
| Verify post-trade balances | `mantle_getBalance`, `mantle_getTokenBalances` |
| Resolve trusted addresses | `mantle_resolveAddress` |

---

## 5. Tool Catalog

All tools use the `mantle_` prefix. Input schemas use zod notation for clarity. Every tool returns `{ content: [{ type: "text", text: JSON.stringify(result) }] }` per MCP protocol.

### 5.0 Tool Registration Contract

Every tool module exports a `Record<string, Tool>` object following this interface:

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}
```

**Module export pattern** (one file per domain):

```typescript
// src/tools/chain.ts
export const chainTools = {
  getChainInfo: {
    name: "mantle_getChainInfo",
    description: `Return static chain configuration for a Mantle network.
Examples:
- mainnet: chain_id=5000, native_token=MNT, rpc=https://rpc.mantle.xyz
- sepolia: chain_id=5003, native_token=MNT, rpc=https://rpc.sepolia.mantle.xyz`,
    inputSchema: {
      type: "object" as const,
      properties: {
        network: {
          type: "string",
          description: "Network name (mainnet, sepolia)",
          enum: ["mainnet", "sepolia"],
        },
      },
      required: [],
    },
    handler: async (args: { network?: string }) => {
      // ... implementation
    },
  },
  // ... more tools
};
```

**Tool index (`src/tools/index.ts`):**

```typescript
export { chainTools } from "./chain.js";
export { registryTools } from "./registry.js";
export { accountTools } from "./account.js";
export { tokenTools } from "./token.js";
export { indexerTools } from "./indexer.js";
export { defiReadTools } from "./defi-read.js";
export { simulationTools } from "./simulation.js";
export { diagnosticsTools } from "./diagnostics.js";
export { txBuildTools } from "./tx-build.js";
export { txMonitorTools } from "./tx-monitor.js";
export { explorerTools } from "./explorer.js";
```

Tool descriptions MUST include concrete Mantle examples with real addresses (as shown in the `description` field above). This helps AI agents understand the expected values without additional lookups.

### 5.1 Chain & Network Tools

Supports: mantle-network-primer, mantle-smart-contract-deployer, mantle-portfolio-analyst.

---

**`mantle_getChainInfo`**

Returns static chain configuration for the requested network.
Examples:
- mainnet: chain_id=5000, native_token=MNT, rpc=https://rpc.mantle.xyz, explorer=https://mantlescan.xyz
- sepolia: chain_id=5003, native_token=MNT, rpc=https://rpc.sepolia.mantle.xyz

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
    recommended_solidity_compiler: string,
    wrapped_mnt: string,
    faucet_urls?: string[]
  }
```

Usage guidance:
- For `mantle_build*Tx` workflows, consume the build tool's inline `simulation` result as the canonical pre-sign check.
- Use `mantle_simulateTx` directly for arbitrary calldata, contract-deployment dry-runs, re-simulation on latest state, or deep debugging with overrides.

---

**`mantle_getChainStatus`**

Returns live network status from RPC.
Examples:
- mainnet: block_number=12345678, gas_price_gwei="0.02", syncing=false

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

### 5.2 Address Registry Tools

Supports: mantle-address-registry-navigator, mantle-risk-evaluator, mantle-defi-operator.

---

**`mantle_resolveAddress`**

Lookup a contract address by key, symbol, or alias from the trusted registry. Returns provenance metadata. Fails closed when no verified match exists.
Examples:
- "USDC" on mainnet → 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9 (confidence: high)
- "Agni Router" on mainnet → 0x319B69888b0d11cEC22caA5034e25FfFBDc88421 (confidence: high)
- "mETH" on mainnet → 0xcDA86A272531e8640cD7F1a92c01839911B90bb0 (confidence: high)

```
Input:
  identifier: z.string()               # contract key, token symbol, or alias
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")
  category: z.enum(["system", "token", "bridge", "defi", "any"]).default("any")

Output (success):
  {
    identifier: string,
    network: string,
    address: string,                    # EIP-55 checksummed
    label: string,
    category: string,
    status: "active" | "deprecated" | "paused",
    is_official: boolean,
    source_url: string,
    source_retrieved_at: string,        # ISO-8601
    confidence: "high" | "medium" | "low",
    aliases: string[],
    warnings: string[]                  # includes deprecation warning if legacy alias used
  }

Output (no match):
  Error with code ADDRESS_NOT_FOUND

Backward compatibility:
- Legacy input field `environment` is accepted temporarily and mapped to `network`.
- Legacy value `testnet` maps to `sepolia` with warning:
  `"'testnet' is deprecated; use 'sepolia'"`.
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

### 5.3 Account & Balance Tools

Supports: mantle-portfolio-analyst, mantle-tx-simulator, mantle-defi-operator.

---

**`mantle_getBalance`**

Get native MNT balance for an address.
Examples:
- address=0xABC..., network=mainnet → balance_mnt="1234.56", balance_wei="1234560000000000000000"

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
Examples:
- tokens=["USDC","WETH","mETH"] → balances with symbol, decimals, and normalized amounts
- tokens=["0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9"] → USDC balance by address

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

### 5.4 Token Tools

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

**`mantle_getTokenPrices`**

Read token prices for valuation workflows (portfolio reporting, liquidity normalization, risk checks).
Examples:
- tokens=["USDC","WMNT"], base_currency="usd" → USDC≈1.00, WMNT≈<market price>
- tokens=["WETH"], base_currency="mnt" → WETH price denominated in MNT

```
Input:
  tokens: z.array(z.string()).min(1)     # token symbols or addresses
  base_currency: z.enum(["usd", "mnt"]).default("usd")
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    base_currency: "usd" | "mnt",
    prices: [
      {
        input: string,
        symbol: string | null,
        address: string | null,
        price: string | null,            # decimal string in base currency
        source: "oracle" | "dex_quote" | "indexer" | "none",
        confidence: "high" | "medium" | "low",
        quoted_at_utc: string | null,
        warnings: string[]
      }
    ],
    partial: boolean,                    # true if any token price unavailable
    warnings: string[]
  }
```

Price policy:
- Never fabricate a price. If unavailable, return `price: null` with low confidence and warning.
- This tool is the canonical source for USD-equivalent fields in prompts/workflows.

---

**`mantle_resolveToken`**

Resolve a token symbol to its address on Mantle. Performs quick-reference lookup plus canonical token-list double-check, then applies on-chain metadata validation.
Examples:
- "USDC" → address=0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9, decimals=6, confidence=high
- "mETH" → address=0xcDA86A272531e8640cD7F1a92c01839911B90bb0, decimals=18, confidence=high
- "UNKNOWN" → Error TOKEN_NOT_FOUND

```
Input:
  symbol: z.string()
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")
  require_token_list_match: z.boolean().default(true)

Output:
  {
    input: string,
    symbol: string,
    address: string,
    decimals: number,
    source: "quick_ref" | "token_list" | "both",
    token_list_checked: boolean,
    token_list_match: boolean | null,
    token_list_address: string | null,
    token_list_version: string | null,  # token-list snapshot id (etag/hash)
    confidence: "high" | "medium" | "low",
    network: string,
    warnings: string[]
  }
```

Execution policy:
- Transaction-building flows must call `mantle_resolveToken` with `require_token_list_match=true`.
- Read-only flows may call with `require_token_list_match=false`, but must propagate low-confidence warnings when token-list validation is unavailable.

---

### 5.5 Indexer Tools

Supports: mantle-data-indexer.

---

**`mantle_querySubgraph`**

Execute a GraphQL query against a Mantle subgraph endpoint.

```
Input:
  endpoint: z.string()                  # subgraph GraphQL URL (must pass endpoint allowlist policy)
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
  endpoint: z.string()                  # SQL indexer API URL (must pass endpoint allowlist policy)
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


### 5.6 DeFi Read Tools

Supports: mantle-risk-evaluator, mantle-defi-operator.

---

**`mantle_getSwapQuote`**

Get a DEX swap quote with price impact estimation. Queries on-chain quoters (Agni V3, Merchant Moe) or aggregator APIs.
Examples:
- Swap 100 WMNT → USDC via Agni: estimated_out="45.23", price_impact=0.12%, route="WMNT→USDC (0.3% fee)"
- Swap 1 WETH → USDC via best: tries Agni and Merchant Moe, returns better quote

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
    total_liquidity_usd: number | null, # null if USD valuation unavailable
    fee_tier: number | null,
    collected_at_utc: string
  }
```

USD valuation rule:
- Prefer protocol/indexer-provided USD liquidity if available.
- Otherwise derive from reserves using `mantle_getTokenPrices`.
- If both fail, return `total_liquidity_usd: null` with warning.

---

**`mantle_getLendingMarkets`**

Read market data from Mantle lending protocols.
Examples:
- protocol=aave_v3, asset=USDC → returns Aave V3 reserve metrics for USDC
- protocol=all → returns markets from Aave V3

```
Input:
  protocol: z.enum(["aave_v3", "aave", "all"]).default("all")  # "aave" kept as alias of "aave_v3"
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
        tvl_usd: number | null,         # null if USD valuation unavailable
        ltv: number | null,
        liquidation_threshold: number | null
      }
    ],
    collected_at_utc: string,
    partial: boolean
  }
```

USD valuation rule:
- `tvl_usd` uses protocol-native value when available.
- If unavailable, implementation may derive from reserve/exposure data + `mantle_getTokenPrices`.
- If valuation cannot be established, keep `tvl_usd: null`.

Scope note:
- Ondo market reads are deferred to post-v1 and are not exposed by the first-release schema.

---

### 5.7 Simulation & Debugging Tools

Supports: mantle-tx-simulator, mantle-readonly-debugger, mantle-risk-evaluator, mantle-smart-contract-deployer.

---

**`mantle_simulateTx`**

Simulate a transaction and return state diffs, gas estimate, and success/revert status. Uses `eth_call` with optional state overrides, or a managed simulation API.
Examples:
- ERC-20 transfer: success=true, gas_used="65000", estimated_fee_mnt="0.0006"
- Failed swap (insufficient balance): success=false, revert_reason="STF" (SafeTransferFrom failed)

```
Input:
  from: z.string()
  to: z.string().nullable()             # null for contract creation simulation
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
Examples:
- ERC-20 transfer: function_name="transfer", args={to: "0x...", amount: "1000000"}
- Agni swap: function_name="exactInputSingle", decoded from Agni Router ABI

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
Examples:
- "0x08c379a0..." → error_type="revert", human_explanation="Insufficient balance for transfer"
- Panic code 0x11 → error_type="panic", human_explanation="Arithmetic overflow"

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

### 5.8 Diagnostics Tools

Supports: mantle-readonly-debugger.

---

**`mantle_checkRpcHealth`**

Check connectivity and responsiveness of an RPC endpoint.

```
Input:
  rpc_url: z.string().optional()        # specific URL to test (must pass endpoint allowlist policy); defaults to configured endpoint
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
  rpc_url: z.string()                   # must pass endpoint allowlist policy
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

### 5.9 Transaction Building Tools

Supports: mantle-defi-operator, mantle-smart-contract-deployer.

Every transaction-building tool follows the same output contract:
- `unsigned_tx`: the raw transaction fields (to, data, value, gas) ready for external signing
- `simulation`: inline simulation result (success/revert, gas, fee)
- `human_summary`: one-line plain-English description of what this transaction does
- `warnings`: non-empty array if any risk signals detected

The MCP server **never signs or broadcasts**. The agent presents `human_summary` to the user and delegates signing to an external wallet.
For build workflows, this inline `simulation` satisfies the "simulate before presenting" rule; a separate `mantle_simulateTx` call is optional and used only for re-simulation or custom calldata paths.

---

**`mantle_buildTransferTx`**

Build an unsigned native MNT or ERC-20 transfer transaction.
Examples:
- Transfer 100 USDC: human_summary="Transfer 100 USDC to 0xABC...def on Mantle mainnet"
- Transfer 50 MNT: human_summary="Transfer 50 MNT to 0xABC...def on Mantle mainnet"

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
Examples:
- Approve Agni Router for 100 USDC: human_summary="Approve Agni Router (0x319B...8421) to spend 100 USDC"
- Current unlimited allowance detected: warnings=["Existing unlimited allowance detected"]

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
Examples:
- Swap 100 WMNT for USDC: human_summary="Swap 100 WMNT for ~45.2 USDC via Agni (0.5% slippage, 20min deadline)"
- Swap 1000 USDC for WETH: human_summary="Swap 1000 USDC for ~0.31 WETH via Merchant Moe (0.5% slippage, 20min deadline)"

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
  provider: z.enum(["agni", "merchant_moe"]).default("agni")
  # For add:
  token_a_amount: z.string().optional()
  token_b_amount: z.string().optional()
  # For concentrated-liquidity providers (Agni / UniswapV3 style):
  price_lower: z.string().optional()     # human-readable price lower bound
  price_upper: z.string().optional()     # human-readable price upper bound
  tick_lower: z.number().int().optional()
  tick_upper: z.number().int().optional()
  full_range: z.boolean().default(false)
  # For remove:
  lp_amount: z.string().optional()      # LP token amount to burn
  slippage_bps: z.number().default(50)
  deadline_seconds: z.number().default(1200)
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

Provider-specific rules:
- `provider="agni"` and `action="add"` requires one range mode:
  - `full_range=true`, or
  - both `price_lower` + `price_upper`, or
  - both `tick_lower` + `tick_upper`.
- `provider="merchant_moe"` uses a different LP model (Liquidity Book). In v0.1, `action="add"` for Merchant Moe is out of scope and returns `UNSUPPORTED_PROTOCOL` unless LB parameters are introduced in a future revision.

---

**`mantle_buildLendingTx`**

Build an unsigned lending transaction (Aave V3 style): supply, withdraw, borrow, or repay.
Examples:
- Supply 1000 USDC to Aave V3: human_summary="Supply 1000 USDC to Aave V3 on Mantle"
- Borrow 0.5 WETH variable-rate: human_summary="Borrow 0.5 WETH from Aave V3 (variable rate)"

```
Input:
  from: z.string()
  protocol: z.enum(["aave_v3"]).default("aave_v3")
  action: z.enum(["supply", "withdraw", "borrow", "repay"])
  asset: z.string()                      # token symbol or address
  amount: z.string()                     # human-readable decimal
  on_behalf_of: z.string().optional()    # defaults to from
  interest_rate_mode: z.enum(["variable", "stable"]).optional() # required for borrow/repay where applicable
  referral_code: z.number().default(0)
  network: z.enum(["mainnet", "sepolia"]).default("mainnet")

Output:
  {
    unsigned_tx: { to, data, value, gas_limit, chain_id },
    protocol: string,
    action: string,
    market_context: {
      health_factor_before: string | null,
      health_factor_after_estimate: string | null,
      ltv_after_estimate: number | null
    },
    approval_needed: {
      needed: boolean,
      token: string | null,
      spender: string | null,
      amount_needed: string | null
    },
    simulation: { success, gas_used, estimated_fee_mnt, revert_reason },
    human_summary: string,
    warnings: string[]
  }
```

`mantle_buildLendingTx` must fail closed on risk/data ambiguity:
- For `borrow` and `withdraw`, it must project post-action health factor and block when risk thresholds are breached.
- If health factor data cannot be computed, return `LENDING_DATA_UNAVAILABLE` (no tx build).
- If protocol addresses are unresolved or still marked as `BLOCKER:`, return `UNSUPPORTED_PROTOCOL`.

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

### 5.10 Transaction Monitoring Tools

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

### 5.11 Explorer & Verification Tools

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
| Token | getTokenInfo, getTokenPrices, resolveToken | 3 |
| Indexer | querySubgraph, queryIndexerSql | 2 |
| DeFi Read | getSwapQuote, getPoolLiquidity, getLendingMarkets | 3 |
| Simulation & Debugging | simulateTx, decodeCalldata, decodeError | 3 |
| Diagnostics | checkRpcHealth, probeEndpoint | 2 |
| Transaction Building | buildTransferTx, buildApproveTx, buildSwapTx, buildLiquidityTx, buildLendingTx, buildDeployTx | 6 |
| Transaction Monitoring | getTransactionReceipt, waitForReceipt | 2 |
| Explorer & Verification | verifyContract, checkVerification, getExplorerUrl | 3 |
| **Total** | | **31** |

---

## 6. MCP Resources

Resources are read-only data the agent can fetch as context. They do not perform on-chain calls -- they return static or semi-static reference data that skills need for decision-making.

Resources follow the same module pattern as tools. A single `src/resources.ts` file exports three functions:

```typescript
export interface Resource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export function listResources(): Resource[] { /* return all resource definitions */ }
export function readResource(uri: string): { content: string; mimeType: string } | null { /* dispatch by URI */ }
export async function prefetchResources(): Promise<void> { /* pre-cache remote content on startup */ }
```

### 6.1 Chain Configuration

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

### 6.2 Contract Registry

```
URI: mantle://registry/contracts
Name: Mantle Verified Contract Registry
MIME: application/json

Returns: The same data structure as skills/mantle-address-registry-navigator/assets/registry.json,
         serving as the MCP-accessible mirror of the skill's local registry file.
         Schema: { schema_version, network, updated_at, contracts: [...] }
```

This resource is the MCP equivalent of the skill's `assets/registry.json`. When the mantle-address-registry-navigator skill says "source priority #1: get_contract_address tool", the MCP tool `mantle_resolveAddress` queries this data. When the skill says "source priority #2: local registry file", the agent can alternatively read this resource directly.

### 6.3 Token Registry

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

Notes:
- This resource is the embedded quick-reference snapshot.
- `mantle_resolveToken` must cross-check against `MANTLE_TOKEN_LIST_URL` before returning high-confidence token resolution for execution workflows.

### 6.4 Protocol Registry

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
      "ondo": {
        name: "Ondo Finance",
        type: "rwa",
        status: "planned",
        contracts: {
          router: "BLOCKER: fill from Ondo official docs and verify on Mantlescan",
          vault_manager: "BLOCKER: fill from Ondo official docs and verify on Mantlescan"
        }
      },
      "aave_v3": {
        name: "Aave V3",
        type: "lending",
        contracts: {
          pool: "BLOCKER: fill from Aave V3 deployed contracts docs and verify on Mantlescan",
          pool_data_provider: "BLOCKER: fill from Aave V3 deployed contracts docs and verify on Mantlescan",
          pool_addresses_provider: "BLOCKER: fill from Aave V3 deployed contracts docs and verify on Mantlescan"
        }
      },
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

Address integrity policy:
- `aave_v3` entries must be filled from canonical sources (official docs + Mantlescan verification) for v1 execution.
- `ondo` entries are tracked as planned and remain non-executable in v1.
- CI fails if any `BLOCKER:` placeholder exists in enabled protocol resources.
- While placeholders remain for an enabled protocol, write paths return `UNSUPPORTED_PROTOCOL`.

### 6.5 ABI Registry

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
  - mantle-bridge
  - permit2
  - multicall3

Ondo ABIs are planned for a post-v1 release and are intentionally excluded from the first-release ABI list.

Returns: Standard JSON ABI array
```

ABIs are used by `mantle_decodeCalldata`, `mantle_decodeError`, and `mantle_simulateTx` for automatic decoding. They are also available directly to agents that need to inspect contract interfaces.

### 6.6 Network Basics Document

```
URI: mantle://docs/network-basics
Name: Mantle Network Basics
MIME: text/markdown

Returns: The content of skills/mantle-network-primer/references/mantle-network-basics.md,
         providing the same factual grounding available to the network primer skill.
```

This resource allows any agent (not just one using the network-primer skill) to access Mantle network fundamentals directly through MCP.

### 6.7 DeFi Execution Guardrails

```
URI: mantle://docs/defi-guardrails
Name: DeFi Execution Guardrails
MIME: text/markdown
Description: CRITICAL: Slippage caps, approval hygiene, deadline policy, and position-size
             limits for DeFi operations on Mantle. Read before building any swap or liquidity tx.

Returns: The content of skills/mantle-defi-operator/references/defi-execution-guardrails.md
```

### 6.8 Risk Checklist

```
URI: mantle://docs/risk-checklist
Name: Transaction Risk Checklist
MIME: text/markdown
Description: Pre-execution risk checks for Mantle transactions. Covers slippage, liquidity depth,
             address trust, gas sanity, and allowance scope.

Returns: The content of skills/mantle-risk-evaluator/references/risk-checklist.md
```

### 6.9 WYSIWYS Template

```
URI: mantle://docs/wysiwys-template
Name: WYSIWYS Confirmation Template
MIME: text/markdown
Description: What You See Is What You Sign -- template for presenting transaction details
             to users before signing. Ensures human_summary is formatted consistently.

Returns: The content of skills/mantle-tx-simulator/references/wysiwys-template.md
```

### 6.10 Indexer Query Templates

```
URI: mantle://docs/query-templates
Name: Indexer Query Templates
MIME: text/markdown
Description: Pre-built GraphQL and SQL query templates for common Mantle data lookups.
             Includes swap history, liquidity positions, token transfers, and protocol TVL.

Returns: The content of skills/mantle-data-indexer/references/query-templates.md
```

### 6.11 Gas and Fees Guide

```
URI: mantle://docs/gas-and-fees
Name: Mantle Gas and Fee Guide
MIME: text/markdown

Returns:
  # Mantle Gas and Fees

  ## Gas Token
  Mantle uses MNT as its native gas token, NOT ETH.
  All gas estimates from mantle-mcp tools are denominated in MNT.

  ## Typical Gas Costs (February 2026)

  | Operation              | Gas Units  | Approx MNT Cost |
  |------------------------|-----------|------------------|
  | Native MNT transfer    | 21,000    | ~0.0002 MNT      |
  | ERC-20 transfer        | 65,000    | ~0.0006 MNT      |
  | ERC-20 approve         | 46,000    | ~0.0004 MNT      |
  | DEX swap (Agni V3)     | 180,000   | ~0.0016 MNT      |
  | Add liquidity          | 250,000   | ~0.0022 MNT      |
  | Contract deploy (med)  | 1,500,000 | ~0.013 MNT       |

  ## Gas Price
  Mantle L2 gas is very cheap. Typical gas price: ~0.02 gwei.
  Use mantle_getChainStatus to check live gas price.

  ## L1 Data Fee
  Mantle posts transaction data to Ethereum L1 via EigenDA.
  The L1 data fee component is typically negligible but varies with L1 congestion.

  ## RPC Endpoints
  | Network        | RPC                            | Rate Limit |
  |----------------|--------------------------------|------------|
  | Mainnet        | https://rpc.mantle.xyz         | Public, generous |
  | Sepolia        | https://rpc.sepolia.mantle.xyz | Public, generous |

  For high-throughput applications, consider a dedicated RPC provider.
```

### 6.12 Safety Rules

```
URI: mantle://rules/safety
Name: Critical Safety Rules
MIME: text/markdown
Description: REVIEW REQUIRED: Critical safety rules for Mantle agent operations.
             Read after building transactions, before presenting to user.

Returns:
  # Critical Safety Rules for Mantle MCP

  ## Rule 1: Never Use Unverified Addresses
  Every address used in a transaction-building tool MUST come from either:
  - mantle_resolveAddress (registry lookup)
  - mantle_validateAddress (format + on-chain code check)
  - Direct user input that has been validated through mantle_validateAddress

  If an address cannot be verified, STOP. Ask the user for clarification.

  ## Rule 2: Never Skip Simulation
  Before presenting any transaction to the user:
  - Call mantle_simulateTx
  - If simulation fails, report the revert reason
  - Do NOT present a failed simulation as a valid transaction

  ## Rule 3: Respect Allowance Hygiene
  - NEVER approve unlimited amounts (type(uint256).max) unless the user explicitly requests it
  - Always check current allowance before building an approve tx
  - Warn if an existing unlimited allowance is detected

  ## Rule 4: Slippage Guards
  - Default slippage: 50 bps (0.5%)
  - WARN if price impact > 100 bps (1%)
  - BLOCK if price impact > 500 bps (5%)
  - BLOCK if pool TVL < $10,000

  ## Rule 5: Amount Validation
  - Verify sender has sufficient balance before building transfer/swap
  - Verify token decimals match the expected format
  - Reject negative amounts, zero amounts (for transfers), or amounts > balance

  ## Rule 6: human_summary Must Be Accurate
  The human_summary field MUST exactly reflect what the transaction will do.
  Never summarize a swap as a transfer, or omit the slippage/deadline parameters.
```

### 6.13 Server Instructions Resource

```
URI: mantle://rules/server-instructions
Name: Server Instructions
MIME: text/markdown
Description: Complete server usage instructions for AI agents. Same content as SERVER_INSTRUCTIONS.md.

Returns: The full content of SERVER_INSTRUCTIONS.md (see section 2.2)
```

### 6.14 Companion MCP Guide

```
URI: mantle://companion/blockscout
Name: Using Blockscout MCP with Mantle MCP
MIME: text/markdown
Description: Guide on using mantle-mcp alongside Blockscout MCP for comprehensive
             Mantle development.

Returns:
  # Companion MCPs for Mantle Development

  mantle-mcp handles Mantle-specific operations: address registry, DeFi reads,
  simulation, and transaction building. For broader blockchain exploration,
  combine with this companion MCP.

  ## Recommended Stack

  | MCP Server       | Package                  | Purpose                           |
  |------------------|--------------------------|-----------------------------------|
  | mantle-mcp       | mantle-mcp               | Mantle chain reads, tx building   |
  | Blockscout MCP   | @blockscout/mcp-server   | Transaction analysis, contract ABIs, on-chain data |

  ## Division of Responsibilities

  | Task                          | mantle-mcp | Blockscout |
  |-------------------------------|:----------:|:----------:|
  | Mantle token/protocol registry| YES        |            |
  | Build unsigned transactions   | YES        |            |
  | Simulate transactions         | YES        |            |
  | DeFi quotes/markets (Agni, Merchant Moe, Aave V3) | YES |        |
  | Analyze transaction traces    |            | YES        |
  | Fetch contract ABIs (any EVM) |            | YES        |
  | Verify contract source        | YES (Mantle)| YES (any) |
  | Check token balances (any EVM)|            | YES        |
  | Check Mantle balances         | YES        |            |

  ## When to Use Each

  ### mantle-mcp
  - Building transactions on Mantle (swaps, transfers, lending, deploys)
  - Looking up Mantle-specific addresses (Agni, Aave V3, mETH, cmETH)
  - Ondo integration is planned post-v1 (not executable in first release)
  - Simulating Mantle transactions
  - Checking Mantle balances and allowances

  ### Blockscout MCP
  - Analyzing transaction traces on any EVM chain
  - Fetching verified contract ABIs
  - Exploring on-chain data beyond Mantle's registry
  - Debugging failed transactions with detailed traces

  ## Configuration

  ```json
  {
    "mcpServers": {
      "mantle": {
        "command": "npx",
        "args": ["-y", "mantle-mcp@latest"]
      },
      "blockscout": {
        "command": "npx",
        "args": ["-y", "@blockscout/mcp-server"]
      }
    }
  }
  ```
```

### Resource Count Summary

| Category | Resources | Count |
|----------|-----------|-------|
| Chain Config | chain/mainnet, chain/sepolia | 2 |
| Registries | registry/contracts, registry/tokens, registry/protocols | 3 |
| ABIs | abis/{name} | 1 (templated) |
| Knowledge Docs | docs/network-basics, docs/defi-guardrails, docs/risk-checklist, docs/wysiwys-template, docs/query-templates, docs/gas-and-fees | 6 |
| Rules | rules/safety, rules/server-instructions | 2 |
| Companion | companion/blockscout | 1 |
| **Total** | | **15** |

---

## 7. MCP Prompts

Prompts are reusable instruction templates that agents request when starting a specific workflow. Each prompt returns a multi-turn conversation (`PromptMessage[]`) following the eth-mcp pattern: a user question followed by a detailed assistant response that serves as a complete workflow playbook.

**Prompt module pattern (`src/prompts.ts`):**

```typescript
export interface Prompt {
  name: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

export const prompts: Prompt[] = [ /* ... */ ];

export function getPromptMessages(name: string): PromptMessage[] | null {
  switch (name) {
    case "mantle_portfolioAudit": return [ /* ... */ ];
    // ...
    default: return null;
  }
}
```

### 7.1 Portfolio Audit

```
Name: mantle_portfolioAudit
Description: Guide through a complete Mantle wallet audit: balances, allowances, and risk exposure.

Arguments:
  - wallet_address (required): The wallet to audit
  - network (optional, default "mainnet"): mainnet or sepolia
  - scope (optional, default "full"): "full", "balances_only", or "allowances_only"
```

**Returns the following multi-turn conversation:**

User message: `"How do I audit a wallet's portfolio on Mantle?"`

Assistant message:

```
# Mantle Portfolio Audit Workflow

## Step 1: Confirm Environment

mantle_getChainInfo({ network: "mainnet" })
→ Verify chain_id=5000, rpc is responsive

## Step 2: Fetch Native Balance

mantle_getBalance({ address: "<wallet>", network: "mainnet" })
→ Returns balance_mnt (e.g., "1234.56")

## Step 3: Fetch Token Balances

First read the token registry:
  Resource: mantle://registry/tokens → get list of known tokens

Then batch-read:
mantle_getTokenBalances({
  address: "<wallet>",
  tokens: ["WMNT", "WETH", "USDC", "USDT", "mETH", "cmETH"],
  network: "mainnet"
})
→ Returns per-token balance with decimals and symbol

## Step 4: Fetch Allowances

Read the protocol registry for known spenders:
  Resource: mantle://registry/protocols → Agni router, Merchant Moe router, Aave V3 pool (Ondo planned post-v1), etc.

mantle_getAllowances({
  owner: "<wallet>",
  pairs: [
    { token: "USDC", spender: "0x319B69888b0d11cEC22caA5034e25FfFBDc88421" },
    { token: "WMNT", spender: "0x319B69888b0d11cEC22caA5034e25FfFBDc88421" },
    ...
  ],
  network: "mainnet"
})

## Step 5: Risk Classification

For each allowance returned:
- is_unlimited=true → FLAG as "Unlimited allowance to <spender_label>"
- allowance > 10x typical transaction size → FLAG as "Excessive allowance"
- spender not in registry → FLAG as "Unknown spender"

## Step 6: Format Report

Fetch valuation inputs:
mantle_getTokenPrices({
  tokens: ["MNT", "USDC", "mETH"],
  base_currency: "usd",
  network: "mainnet"
})
→ Use returned prices for USD equivalent; if price is unavailable, display `N/A` (never estimate manually).

| Asset | Balance         | USD Equivalent |
|-------|-----------------|----------------|
| MNT   | 1,234.56        | ~$X            |
| USDC  | 5,000.00        | ~$5,000        |
| mETH  | 2.5             | ~$Y            |

Allowance Alerts:
- USDC → Agni Router: Unlimited (WARN: consider revoking)
- WMNT → Unknown 0xABC...def: 10,000 WMNT (DANGER: unknown spender)

## Common Mistakes

| Mistake                              | Fix                                    |
|--------------------------------------|----------------------------------------|
| Forgetting to check allowances       | Always include step 4                  |
| Using ETH instead of MNT for gas     | Mantle native token is MNT             |
| Not resolving token symbols first    | Use mantle_resolveToken for any symbol |
| Checking only one or two tokens      | Always check the full registry list    |
```

### 7.2 Swap Workflow

```
Name: mantle_swapWorkflow
Description: CRITICAL: Guide through a safe token swap on Mantle with risk checks, approval handling, and post-trade verification.

Arguments:
  - token_in (required): Token to sell (symbol or address)
  - token_out (required): Token to buy (symbol or address)
  - amount (required): Amount to swap (human-readable)
  - from_address (required): Sender wallet address
```

**Returns multi-turn conversation:**

User: `"How do I safely swap tokens on Mantle?"`

Assistant message:

```
# Mantle Token Swap Workflow

## CRITICAL RULE: Never skip risk checks. Never skip simulation.

## Step 1: Resolve Both Tokens

mantle_resolveToken({ symbol: "WMNT", network: "mainnet" })
→ { address: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8", decimals: 18, confidence: "high" }

mantle_resolveToken({ symbol: "USDC", network: "mainnet" })
→ { address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", decimals: 6, confidence: "high" }

If confidence is NOT "high", WARN the user and ask for confirmation.

## Step 2: Get Swap Quote

mantle_getSwapQuote({
  token_in: "WMNT",
  token_out: "USDC",
  amount_in: "100",
  provider: "best",
  network: "mainnet"
})
→ { estimated_out_decimal: "45.23", price_impact_pct: 0.12, provider: "agni", warnings: [] }

### Price Impact Decision Table

| Price Impact  | Action                                     |
|---------------|--------------------------------------------|
| < 0.5%        | PASS - proceed normally                    |
| 0.5% - 1%     | WARN - inform user, proceed if they agree  |
| 1% - 5%       | STRONG WARN - recommend smaller trade size |
| > 5%          | BLOCK - refuse to proceed, suggest splitting|

## Step 3: Check Approval

The quote response tells you the router address. Check current allowance:

mantle_getAllowances({
  owner: "<from_address>",
  pairs: [{ token: "WMNT", spender: "<router_address>" }],
  network: "mainnet"
})

If allowance < amount_in:
  → Build approval FIRST via mantle_buildApproveTx
  → Present approval human_summary to user
  → Wait for user to sign and confirm
  → THEN proceed to step 4

## Step 4: Build Swap Transaction

mantle_buildSwapTx({
  from: "<from_address>",
  token_in: "WMNT",
  token_out: "USDC",
  amount_in: "100",
  slippage_bps: 50,
  deadline_seconds: 1200,
  provider: "best",
  network: "mainnet"
})
→ { unsigned_tx: {...}, simulation: { success: true }, human_summary: "Swap 100 WMNT for ~45.23 USDC via Agni (0.5% slippage, 20min deadline)" }

## Step 5: Present to User (WYSIWYS)

Show the human_summary verbatim:
> "Swap 100 WMNT for ~45.23 USDC via Agni (0.5% slippage, 20min deadline)"
> Estimated gas: 0.0016 MNT

Wait for explicit user confirmation before they sign.

## Step 6: Monitor Execution

After user signs and broadcasts:
mantle_waitForReceipt({ tx_hash: "0x...", network: "mainnet" })
→ { status: "success", gas_used: "180000", fee_mnt: "0.0016" }

## Step 7: Verify Post-Trade Balances

mantle_getTokenBalances({ address: "<from_address>", tokens: ["WMNT", "USDC"], network: "mainnet" })
→ Confirm WMNT decreased by ~100 and USDC increased by ~45.23

## Common Mistakes

| Mistake                                    | Fix                                      |
|--------------------------------------------|------------------------------------------|
| Swapping without checking approval first   | Always check allowance in step 3         |
| Using unlimited approval for convenience   | Approve exact amount needed              |
| Skipping simulation                        | Simulation is mandatory (tenet T3)       |
| Not showing human_summary before signing   | Always present WYSIWYS confirmation      |
| Ignoring high price impact warnings        | Follow the decision table above          |
```

### 7.3 Deploy Workflow

```
Name: mantle_deployWorkflow
Description: Guide through contract deployment and verification on Mantle. Covers cost estimation, unsigned tx building, receipt monitoring, and source verification.

Arguments:
  - contract_name (required): Name of the contract to deploy
  - network (required): mainnet or sepolia
  - deployer_address (required): Address that will deploy
```

**Returns multi-turn conversation:**

User: `"How do I deploy a smart contract on Mantle?"`

Assistant message:

```
# Mantle Contract Deployment Workflow

## CRITICAL: mantle-mcp builds unsigned deployment transactions. It does NOT compile
## contracts or manage private keys. The user must compile externally (Foundry/Hardhat)
## and sign with their own wallet.

## Step 1: Confirm Environment

mantle_getChainInfo({ network: "mainnet" })
→ { chain_id: 5000, native_token: { symbol: "MNT" }, recommended_solidity_compiler: "v0.8.23 or below" }

Verify the user's compiler version matches. Mantle is OP Stack-based but may have
EVM opcode differences from mainnet Ethereum.

## Step 2: Estimate Deployment Cost

mantle_simulateTx({
  from: "<deployer_address>",
  to: null,
  data: "<bytecode + encoded constructor args>",
  network: "mainnet"
})
→ { success: true, gas_used: "1500000", estimated_fee_mnt: "0.013" }

Tell the user: "Deployment will cost approximately 0.013 MNT in gas."

## Step 3: Check Deployer Balance

mantle_getBalance({ address: "<deployer_address>", network: "mainnet" })

If balance < estimated fee, tell the user to fund the deployer.

## Step 4: Build Deployment Transaction

mantle_buildDeployTx({
  from: "<deployer_address>",
  bytecode: "<compiled bytecode hex>",
  constructor_args_encoded: "<ABI-encoded args>",
  network: "mainnet"
})
→ { unsigned_tx: {...}, estimated_address: "0x...", human_summary: "Deploy contract (45.2KB) on Mantle mainnet" }

## Step 5: Present to User

Show: "Deploy contract (45.2KB) on Mantle mainnet. Estimated cost: 0.013 MNT.
Predicted address: 0x..."

Wait for user confirmation and signing.

## Step 6: Monitor Deployment

mantle_waitForReceipt({ tx_hash: "0x...", network: "mainnet" })
→ { status: "success", contract_address: "0x...", gas_used: "1450000" }

## Step 7: Verify Source Code

mantle_verifyContract({
  address: "<deployed_address>",
  source_code: "<flattened source>",
  contract_name: "MyContract",
  compiler_version: "v0.8.23+commit.f704f362",
  optimization_enabled: true,
  optimization_runs: 200,
  network: "mainnet"
})

## Step 8: Check Verification Status

mantle_checkVerification({ verification_id: "...", network: "mainnet" })
→ { status: "success", explorer_url: "https://mantlescan.xyz/address/0x.../code" }

Report the explorer URL to the user.
```

### 7.4 Debug Read Failure

```
Name: mantle_debugReadFailure
Description: Structured diagnosis of a read-path failure on Mantle. Classifies errors, checks RPC health, and suggests fixes.

Arguments:
  - method_or_tool (required): The tool or RPC method that failed
  - error_text (required): The error message or data
  - endpoint (optional): The RPC endpoint that was used
```

**Returns multi-turn conversation:**

User: `"A Mantle RPC call is failing. How do I debug it?"`

Assistant message:

```
# Mantle Read Failure Debugging Workflow

## Step 1: Classify the Error

mantle_decodeError({
  error_data: "<error hex or message>",
  context: "<method that failed>"
})
→ { error_type: "revert" | "rpc_error" | "custom_error", human_explanation: "...", suggested_actions: [...] }

### Error Type Decision Tree

| error_type     | Next Step                                   |
|----------------|---------------------------------------------|
| rpc_error      | Go to Step 2 (check endpoint)               |
| revert         | Check contract state (balance, allowance)    |
| custom_error   | Decode with ABI, check contract docs         |
| panic          | Likely a bug - overflow, division by zero    |

## Step 2: Check RPC Health

mantle_checkRpcHealth({ network: "mainnet" })
→ { reachable: true/false, latency_ms: 120, chain_id_matches: true }

If unreachable or high latency (>5000ms):

mantle_probeEndpoint({
  rpc_url: "https://rpc.mantle.xyz",
  method: "eth_blockNumber"
})

Try fallback: mantle_probeEndpoint({ rpc_url: "<MANTLE_RPC_FALLBACK_URL>" })

## Step 3: Common Causes and Fixes

| Symptom                          | Cause                        | Fix                        |
|----------------------------------|------------------------------|----------------------------|
| "execution reverted"             | Contract logic rejection     | Check args, balances       |
| Connection timeout               | RPC endpoint down            | Use fallback endpoint      |
| "chain id mismatch"              | Wrong network config         | Verify MANTLE_RPC_URL      |
| "nonce too low"                  | Stale nonce                  | Re-query with latest block |
| HTTP 429                         | Rate limited                 | Use dedicated RPC provider |

## Step 4: Report Diagnosis

Provide structured report:
- Error classification
- Root cause hypothesis
- Steps tried
- Suggested resolution
```

### 7.5 Risk Preflight

```
Name: mantle_riskPreflight
Description: CRITICAL: Run mandatory pre-execution risk checks for a Mantle transaction. Must be called before any transaction-building tool.

Arguments:
  - operation_type (required): swap, add_liquidity, remove_liquidity, transfer, deploy, supply, withdraw, borrow, repay
  - token_in (optional): Input token
  - token_out (optional): Output token
  - amount (optional): Amount
  - target_address (optional): Contract/router/pool address
  - slippage_cap_bps (optional, default 50): User's slippage cap in basis points
```

**Returns multi-turn conversation:**

User: `"What risk checks should I run before executing a Mantle transaction?"`

Assistant message:

```
# Mantle Risk Preflight Checklist

Run ALL applicable checks before building any transaction.

## Check 1: Address Verification (ALL operations)

mantle_resolveAddress({ identifier: "<target>", network: "mainnet" })
→ PASS if confidence="high" and status="active"
→ BLOCK if not found in registry (unverified address)

mantle_validateAddress({ address: "<target>", check_code: true, network: "mainnet" })
→ BLOCK if is_zero_address=true
→ WARN if has_code=false (sending to EOA when expecting contract)

## Check 2: Balance Sufficiency (swap, transfer, add_liquidity, supply, repay)

mantle_getBalance or mantle_getTokenBalances for the input token.
→ BLOCK if balance < amount

## Check 3: Slippage / Price Impact (swap only)

mantle_getSwapQuote for the intended trade.
→ PASS if price_impact < 0.5%
→ WARN if 0.5% <= price_impact < 1%
→ STRONG WARN if 1% <= price_impact < 5%
→ BLOCK if price_impact >= 5%

Override: user may set slippage_cap_bps to accept higher impact.

## Check 4: Liquidity Depth (swap, add_liquidity)

mantle_getPoolLiquidity for the relevant pool.
If `total_liquidity_usd` is null, estimate via reserve amounts + `mantle_getTokenPrices`.
→ BLOCK if effective_liquidity_usd < $10,000
→ WARN if effective_liquidity_usd < $100,000
→ WARN if USD liquidity cannot be computed after fallback (never fabricate)

## Check 5: Allowance Scope (swap, add_liquidity, supply, repay)

mantle_getAllowances for current token-spender allowance.
→ WARN if is_unlimited=true (recommend revoking after operation)
→ PASS if allowance matches expected amount

## Check 6: Lending Health Factor (borrow, withdraw)

mantle_getLendingMarkets + mantle_buildLendingTx market_context projection
(optional `mantle_simulateTx` only for external/re-simulation paths).
→ BLOCK if health-factor data is unavailable (`LENDING_DATA_UNAVAILABLE`, fail closed)
→ BLOCK if projected health factor < 1.0
→ STRONG WARN if 1.0 <= projected health factor < 1.25
→ WARN if 1.25 <= projected health factor < 1.5
→ WARN if projected health factor drop > 30% from current
→ PASS otherwise

Threshold overrides:
- `LENDING_HF_MIN_BLOCK` (default `1.0`, hard floor cannot be set below `1.0`)
- `LENDING_HF_MIN_WARN` (default `1.5`)

## Check 7: Gas Sanity (ALL operations)

For `mantle_build*Tx` workflows, use the build response `simulation`.
Use `mantle_simulateTx` only if calldata was provided externally or must be re-simulated at latest state.
→ BLOCK if simulation fails (revert)
→ WARN if gas_used > 2x typical for this operation type
→ PASS otherwise

## Preflight Verdict

| Verdict | Meaning                                          |
|---------|--------------------------------------------------|
| PASS    | All checks passed. Safe to proceed.              |
| WARN    | Some checks flagged. Inform user, proceed if OK. |
| BLOCK   | Critical check failed. Do NOT proceed.           |

Format: Return a structured JSON with per-check results and overall verdict.
```

### 7.6 Companion MCPs

```
Name: mantle_companionMcps
Description: Guide on using mantle-mcp alongside Blockscout MCP for comprehensive Mantle development.

Arguments: (none)
```

**Returns multi-turn conversation:**

User: `"What MCP servers should I use alongside mantle-mcp?"`

Assistant message:

```
# Companion MCPs for Mantle Development

## Recommended Stack

| MCP Server     | Package                | Purpose                     |
|----------------|------------------------|-----------------------------|
| mantle-mcp     | mantle-mcp             | Mantle reads, tx building   |
| Blockscout MCP | @blockscout/mcp-server | Tx analysis, contract ABIs  |

## Configuration

{
  "mcpServers": {
    "mantle": { "command": "npx", "args": ["-y", "mantle-mcp@latest"] },
    "blockscout": { "command": "npx", "args": ["-y", "@blockscout/mcp-server"] }
  }
}

## When to Use Each

### mantle-mcp (this server)
- Resolve Mantle-specific addresses: mantle_resolveAddress("Agni Router")
- Build unsigned transactions: mantle_buildSwapTx, mantle_buildTransferTx, mantle_buildLendingTx
- Simulate transactions: mantle_simulateTx
- Check Mantle balances/allowances
- Query DeFi quotes/markets from Agni, Merchant Moe, Aave V3
- Ondo support is planned for a later release

### Blockscout MCP
- Analyze transaction traces on any chain (not just Mantle)
- Fetch verified contract ABIs from explorers
- Look up token info by symbol across chains
- Debug failed transactions with detailed execution traces

## Example: Cross-Chain Research

1. Blockscout: blockscout.get_tokens_by_address("5000", "<address>") → Mantle tokens
2. mantle-mcp: mantle_getTokenBalances({ address: "<address>", tokens: [...] }) → detailed balances
```

### 7.7 Mantle Basics

```
Name: mantle_mantleBasics
Description: Mantle network fundamentals for agents new to the ecosystem. Covers chain architecture, key tokens, and protocol landscape.

Arguments: (none)
```

**Returns multi-turn conversation:**

User: `"What is Mantle and how does it work?"`

Assistant message:

```
# Mantle Network Fundamentals

## Architecture
Mantle is an Ethereum Layer 2 using the OP Stack with EigenDA for data availability.
- Inherits Ethereum's security
- Posts transaction data to Ethereum L1
- Uses EigenDA instead of Ethereum calldata (cheaper)

## Key Facts

| Property          | Value                              |
|-------------------|------------------------------------|
| Chain ID          | 5000 (mainnet), 5003 (sepolia)     |
| Gas Token         | MNT (NOT ETH)                      |
| Block Time        | ~2 seconds                         |
| Finality          | ~12 minutes (L1 confirmation)      |
| EVM Compatibility | Full (with minor opcode caveats)   |

## Core Tokens

| Token | Role                    | Address (mainnet)                    |
|-------|-------------------------|--------------------------------------|
| MNT   | Native gas token        | (native)                             |
| WMNT  | Wrapped MNT (ERC-20)   | 0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8 |
| WETH  | Bridged ETH            | 0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111 |
| mETH  | Mantle Staked ETH      | 0xcDA86A272531e8640cD7F1a92c01839911B90bb0 |
| cmETH | Restaked mETH          | 0xE6829d9a7eE3040e1276Fa75293Bde931859e8fA |
| USDC  | USD stablecoin         | 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9 |
| USDT  | USD stablecoin         | 0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE |

## DeFi Landscape

| Protocol      | Type     | Key Feature                     |
|---------------|----------|---------------------------------|
| Agni Finance  | DEX      | Uniswap V3 fork, concentrated liquidity |
| Merchant Moe  | DEX      | Liquidity Book (Joe V2 fork)    |
| Aave V3       | Lending  | Blue-chip lending market, broad collateral support |
| Ondo          | RWA/Yield| Tokenized real-world-asset yield markets (planned post-v1) |

## Using mantle-mcp

Start with these tools to explore:
1. mantle_getChainInfo({ network: "mainnet" }) → chain config
2. mantle_getChainStatus({ network: "mainnet" }) → live block number, gas price
3. Resource: mantle://registry/tokens → all known tokens
4. Resource: mantle://registry/protocols → all known protocol addresses
```

### 7.8 Gas Configuration

```
Name: mantle_gasConfiguration
Description: CRITICAL: MNT gas token guidance, fee estimation, and RPC configuration for Mantle.

Arguments: (none)
```

**Returns multi-turn conversation:**

User: `"How does gas work on Mantle?"`

Assistant message:

```
# Mantle Gas Configuration

## CRITICAL: Gas Token is MNT, Not ETH

Every gas estimate, fee calculation, and native balance from mantle-mcp is in MNT.
If you see a balance of "1234.56" from mantle_getBalance, that is 1,234.56 MNT.

## Gas Costs (Very Cheap)

| Operation              | Typical Gas | Approx MNT Cost |
|------------------------|-------------|------------------|
| MNT transfer           | 21,000      | ~0.0002 MNT      |
| ERC-20 transfer        | 65,000      | ~0.0006 MNT      |
| Token approve          | 46,000      | ~0.0004 MNT      |
| DEX swap               | 180,000     | ~0.0016 MNT      |
| Add liquidity          | 250,000     | ~0.0022 MNT      |
| Contract deployment    | 1-3M        | ~0.01-0.03 MNT   |

## Checking Live Gas Price

mantle_getChainStatus({ network: "mainnet" })
→ { gas_price_gwei: "0.02", block_number: 12345678 }

## RPC Endpoints

| Network | URL                            | Notes                |
|---------|--------------------------------|----------------------|
| Mainnet | https://rpc.mantle.xyz         | Public, generous limits |
| Sepolia | https://rpc.sepolia.mantle.xyz | Public, for testing  |

For production or high-throughput:
- Set MANTLE_RPC_URL env var to a dedicated provider
- Set MANTLE_RPC_FALLBACK_URL for diagnostics tools

## L1 Data Fee

Mantle posts data to Ethereum L1 via EigenDA. The L1 component is typically
negligible (~1-5% of total fee) but increases during L1 congestion.
The fee shown by mantle_simulateTx includes both L2 execution and L1 data cost.

## Common Mistakes

| Mistake                                  | Fix                                    |
|------------------------------------------|----------------------------------------|
| Assuming gas token is ETH                | Gas is MNT. Always.                    |
| Using Ethereum gas price estimates       | Mantle gas is ~0.02 gwei, not 10+ gwei|
| Forgetting L1 data fee in estimates      | mantle_simulateTx includes it          |
| Not funding deployer with MNT            | Check balance before deploy            |
```

---

## 8. Error Contract

Every tool returns the same error shape when it cannot produce a valid result. Errors flow through two layers: tool-level typed errors and server-level wrapping.

### 8.1 Server-Level Error Dispatch

The `CallToolRequestSchema` handler in `server.ts` (see section 3.4) wraps every tool invocation in a uniform try/catch:

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = allTools[name];
  if (!tool) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: true, code: "UNKNOWN_TOOL", message: `Unknown tool: ${name}` }) }],
      isError: true,
    };
  }
  try {
    const result = await tool.handler(args || {});
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    if (err instanceof MantleMcpError) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: true,
          code: err.code,
          message: err.message,
          suggestion: err.suggestion,
          details: err.details,
        }) }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify({
        error: true,
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
        suggestion: "Retry the operation or check server logs.",
        details: null,
      }) }],
      isError: true,
    };
  }
});
```

Tool handlers throw `MantleMcpError` instances for typed errors:

```typescript
class MantleMcpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly suggestion: string,
    public readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
  }
}
```

### 8.2 Error Response Shape

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

### 8.3 Error Code Catalog

| Code | Meaning | Typical Trigger |
|------|---------|----------------|
| `INVALID_INPUT` | Input schema or required value validation failed | Empty token list in `mantle_getTokenPrices`; missing required structured fields |
| `PROMPT_NOT_FOUND` | Requested prompt does not exist | `GetPromptRequestSchema` with unknown prompt name |
| `INVALID_ADDRESS` | Malformed or non-checksummed address | Bad input to any address parameter |
| `ZERO_ADDRESS` | Zero address provided where non-zero required | Transfer/approve to 0x000...000 |
| `ADDRESS_NOT_FOUND` | No registry match for identifier | `mantle_resolveAddress` with unknown key |
| `TOKEN_NOT_FOUND` | Symbol not in registry and not a valid address | `mantle_resolveToken` with unknown symbol |
| `TOKEN_REGISTRY_MISMATCH` | Embedded quick-reference token data conflicts with canonical token list | `mantle_resolveToken` double-check failure |
| `TOKEN_LIST_UNAVAILABLE` | Canonical token list could not be fetched for execution safety checks | Tx-building token resolution when token list is unavailable |
| `RPC_ERROR` | RPC communication failure | Network timeout, connection refused |
| `RPC_RATE_LIMITED` | RPC endpoint rate limited | HTTP 429 from provider |
| `CHAIN_ID_MISMATCH` | Connected chain ID does not match requested network | RPC misconfiguration |
| `CONTRACT_REVERT` | On-chain call reverted | `mantle_simulateTx`, `mantle_getSwapQuote` |
| `SIMULATION_FAILED` | Transaction simulation could not complete | Backend error in `mantle_simulateTx` |
| `INSUFFICIENT_BALANCE` | Sender balance too low for operation | `mantle_buildTransferTx`, `mantle_buildSwapTx` |
| `APPROVAL_REQUIRED` | ERC-20 allowance insufficient | `mantle_buildSwapTx` (flagged in approval_needed) |
| `POOL_NOT_FOUND` | DEX pool does not exist for pair | `mantle_getPoolLiquidity` |
| `UNSUPPORTED_PROTOCOL` | Requested protocol or protocol mode is unsupported or not fully configured | `mantle_buildLendingTx` when Aave addresses are not configured; `mantle_buildLiquidityTx` for unsupported Merchant Moe add-liquidity mode |
| `LENDING_DATA_UNAVAILABLE` | Lending risk data unavailable for safe projection | Borrow/withdraw preflight in `mantle_buildLendingTx` |
| `NO_ROUTE` | No swap route found for token pair | `mantle_getSwapQuote` |
| `INDEXER_ERROR` | Indexer query failed | `mantle_querySubgraph`, `mantle_queryIndexerSql` |
| `INDEXER_TIMEOUT` | Indexer query exceeded timeout | Long-running query |
| `VERIFICATION_FAILED` | Explorer verification rejected | `mantle_verifyContract` |
| `DECODE_FAILED` | Unable to decode calldata or error | Unknown ABI/selector |
| `ENDPOINT_NOT_ALLOWED` | Endpoint blocked by URL safety policy | Agent-provided endpoint fails allowlist/private-network checks |
| `ENDPOINT_UNREACHABLE` | Probed endpoint did not respond | `mantle_probeEndpoint` |
| `UNSUPPORTED_NETWORK` | Requested network not supported | Non-mainnet/sepolia request |
| `TIMEOUT` | Operation timed out | `mantle_waitForReceipt` |

### 8.4 Error Reporting Rules

- Every error includes a `suggestion` field with a concrete next step the agent can take.
- Errors preserve original upstream error strings in `details.raw_error` when available.
- Partial failures (e.g., 3 of 5 token balance reads succeed) return a success response with `partial: true` rather than an error, so the agent can still use the partial data.
- Transient errors (RPC timeout, rate limit) include `details.retryable: true`.

---

## 9. Security Model

### 9.1 Tool Risk Classification

Every tool is classified by its risk level. This classification determines whether the skill should require user confirmation before acting on the tool's output.

| Category | Risk | Tools | User Confirmation? |
|----------|------|-------|-------------------|
| **Read** | None | getChainInfo, getChainStatus, getBalance, getTokenBalances, getAllowances, getTokenInfo, getTokenPrices, resolveToken, resolveAddress, validateAddress, getSwapQuote, getPoolLiquidity, getLendingMarkets, getTransactionReceipt, getExplorerUrl | No |
| **Query** | Low | querySubgraph, queryIndexerSql | No (endpoint URL still enforced by safety policy) |
| **Simulate** | Low | simulateTx, decodeCalldata, decodeError | No |
| **Diagnose** | Low | checkRpcHealth, probeEndpoint | No (endpoint URL still enforced by safety policy) |
| **Build** | **Medium** | buildTransferTx, buildApproveTx, buildSwapTx, buildLiquidityTx, buildLendingTx, buildDeployTx | **Yes -- present human_summary** |
| **Monitor** | Low | waitForReceipt | No (read-only polling) |
| **Verify** | Low | verifyContract, checkVerification | No (read-only submission) |

### 9.2 No Private Keys

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

### 9.3 Transaction Building Safety Pipeline

Every `mantle_build*Tx` tool internally executes:

1. **Input validation** -- Reject malformed addresses, negative amounts, missing fields.
2. **Token resolution** -- Resolve symbols via `mantle_resolveToken` with `require_token_list_match=true`. Fail with `TOKEN_LIST_UNAVAILABLE` or `TOKEN_REGISTRY_MISMATCH` when canonical validation cannot be satisfied.
3. **Simulation** -- Run `eth_call` to verify the transaction would succeed. Include gas estimate.
4. **Risk signal detection** -- Check for: high price impact, excessive gas, approval to non-registry contract, large value transfer.
5. **Human summary generation** -- Produce plain-English description of the operation.
6. **Warning assembly** -- Aggregate all risk signals into `warnings[]`.

The tool returns the unsigned tx, simulation result, human summary, and warnings. The agent (guided by the skill) then decides whether to present to the user or abort based on the skill's guardrails.

### 9.4 External Endpoint Safety (Indexer + Diagnostics)

`mantle_querySubgraph`, `mantle_queryIndexerSql`, `mantle_checkRpcHealth`, and `mantle_probeEndpoint` can accept agent-provided URLs. To prevent SSRF and internal-network probing, all such inputs pass a shared URL safety policy before any request is made.

Safety controls:
- Protocol allowlist: `https://` by default.
- Optional local HTTP override: `http://` allowed only when explicitly enabled by operator config for local development.
- Private/loopback/link-local rejection: block RFC1918 ranges, loopback, link-local, ULA IPv6, and known cloud metadata endpoints.
- Optional domain allowlist: if `MANTLE_ALLOWED_ENDPOINT_DOMAINS` is set, endpoint host must match this allowlist.
- SQL mutation guard: reject `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `GRANT`.
- Request timeout and response-size caps to limit abuse and context exhaustion.
- No embedded credentials in server code; auth stays in runtime-provided endpoint config.

Requests that fail URL policy return `ENDPOINT_NOT_ALLOWED`.

### 9.5 Address Trust Chain

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

## 10. Configuration

### 10.1 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MANTLE_RPC_URL` | No | `https://rpc.mantle.xyz` | Mainnet RPC endpoint |
| `MANTLE_SEPOLIA_RPC_URL` | No | `https://rpc.sepolia.mantle.xyz` | Sepolia testnet RPC endpoint |
| `MANTLE_RPC_FALLBACK_URL` | No | (none) | Fallback RPC for diagnostics tools |
| `MANTLE_TOKEN_LIST_URL` | No | `https://token-list.mantle.xyz` | Canonical Mantle token list used for token double-check |
| `MANTLE_TOKEN_LIST_TTL_SECONDS` | No | `300` | Cache TTL for canonical token list fetch |
| `MANTLE_TOKEN_LIST_PIN_HASH` | No | (none) | Optional pinned token-list hash/etag for deterministic environments; mismatch fails resolution |
| `MANTLE_ALLOWED_ENDPOINT_DOMAINS` | No | (none) | Comma-separated allowlist for agent-provided endpoint hosts (indexer + diagnostics tools) |
| `MANTLE_ALLOW_HTTP_LOCAL_ENDPOINTS` | No | `false` | If `true`, allow `http://` endpoint URLs for local development only |
| `MANTLE_MCP_TRANSPORT` | No | `stdio` | Transport: `stdio` or `http` |
| `MANTLE_MCP_PORT` | No | `3100` | HTTP transport port (ignored for stdio) |
| `MANTLE_EXPLORER_API_KEY` | No | (none) | Mantlescan API key for verification tools |
| `MANTLE_INDEXER_MAX_ROWS` | No | `1000` | Max rows returned by indexer SQL queries |
| `MANTLE_SUBGRAPH_MAX_RESPONSE_BYTES` | No | `1048576` | Max subgraph response payload size in bytes before request is rejected |
| `MANTLE_SIMULATION_BACKEND` | No | `rpc` | Simulation backend: `rpc` or `tenderly` |
| `LENDING_HF_MIN_BLOCK` | No | `1.0` | Block threshold for projected post-action lending health factor (clamped to >= 1.0 hard floor) |
| `LENDING_HF_MIN_WARN` | No | `1.5` | Warn threshold for projected post-action lending health factor |
| `TENDERLY_ACCESS_KEY` | No | (none) | Required if simulation backend is `tenderly` |
| `TENDERLY_PROJECT` | No | (none) | Required if simulation backend is `tenderly` |

Determinism note:
- `mantle_resolveToken` is deterministic for the same input + on-chain state + token-list snapshot.
- Lower `MANTLE_TOKEN_LIST_TTL_SECONDS` for fresher data; raise it for more stable outputs.
- Set `MANTLE_TOKEN_LIST_PIN_HASH` in CI/tests to force reproducible token resolution snapshots.

### 10.2 MCP Client Configuration

For stdio transport (Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "mantle": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mantle-mcp@latest"],
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

### 10.3 OpenAI Agents Configuration

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

## 11. Relationship to mantle-skills

### 11.1 Separation of Concerns

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

### 11.2 How Skills Reference Tools

Skills reference MCP tools indirectly through workflow descriptions. They do not use formal tool binding syntax. Instead, they describe the action needed and the agent maps it to the available tool:

| Skill says | Agent calls |
|-----------|------------|
| "Fetch native balance" | `mantle_getBalance` |
| "Resolve token addresses via trusted registry" | `mantle_resolveAddress` |
| "Query preferred aggregator/DEX route" | `mantle_getSwapQuote` |
| "Build lending operation (Aave V3)" | `mantle_buildLendingTx` |
| "Execute simulation" | `mantle_simulateTx` |
| "Submit deployment transaction" | `mantle_buildDeployTx` (unsigned) |

This indirection is intentional: skills remain tool-agnostic, and the same skill can work with different MCP implementations as long as the tool semantics match.

### 11.3 Skill-to-Tool Installation Dependency

Skills can function in degraded mode without the MCP server (answering knowledge questions, providing guidance), but they cannot perform on-chain operations. The recommended installation includes both:

```bash
# Install skills (brain)
npx skills add mantle/mantle-skills

# Configure MCP server (muscle)
# Add to .cursor/mcp.json, .claude/mcp.json, or equivalent
```

### 11.4 Lifecycle and Versioning

Skills and the MCP server version independently:

- **Skill changes** (new workflow steps, stricter guardrails, updated reference docs) do not require MCP server updates, as long as the needed tool semantics remain stable.
- **MCP tool changes** (new parameters, expanded output fields, new tools) do not require skill updates, as skills reference tools by intent rather than exact schema.
- **Breaking changes** (tool removal, semantic change in output) require coordinated updates. The MCP server should maintain backward-compatible output shapes and deprecate gracefully.

### 11.5 Registry Data Synchronization

Synchronization must cover contracts, tokens, protocol completeness, and ABI/tool parity.

| CI Check | Source of Truth | Validated Target | Failure Mode |
|----------|------------------|------------------|--------------|
| Contract registry parity | `skills/mantle-address-registry-navigator/assets/registry.json` | MCP `config/registry.json` + `mantle://registry/contracts` | Diff report, fail |
| Token quick-reference parity | Pinned Mantle token-list snapshot | `src/config/tokens.ts` | Diff report, fail |
| Protocol completeness for declared features | v1 feature declarations (`agni`, `merchant_moe`, `aave_v3`); optional post-v1 (`ondo`) | `src/config/protocols.ts` | Missing/partial protocol config, fail |
| ABI presence for declared tools | Tool catalog (`build*Tx` + DeFi read tools) | `src/abis/` registry | Missing ABI mapping, fail |
| Placeholder blocker check | `src/config/` | N/A | Any `BLOCKER:` placeholder, fail |

Recommended update flow:
1. Update canonical source data.
2. Regenerate synchronized config artifacts (`registry`, `tokens`, `protocols`, ABI map).
3. Run CI parity checks above; merge only when all checks pass.

---

## 12. Future Audit Backlog

This section captures deferred findings from `specs/mcp-design-opus-review.md` that are accepted for future implementation. These are intentionally out of current scope and should be tracked as planned follow-up work.

### 12.1 Deferred Items

| ID | Finding | Current State | Future Implementation Plan | Exit Criteria |
|----|---------|---------------|----------------------------|---------------|
| C-02 | `unsigned_tx` lacks nonce + EIP-1559 fields | Build outputs include `{ to, data, value, gas_limit, chain_id }` only | Extend all `mantle_build*Tx` outputs with `nonce`, `max_fee_per_gas`, `max_priority_fee_per_gas`, and `type` (or explicitly document wallet-managed values when null) | All build tool schemas aligned; deploy/swap/approve examples updated; no ambiguity on nonce ownership |
| H-04 | `token` vs `asset` naming inconsistency | Lending APIs use `asset`, others use `token` | Standardize naming to `token` across tool inputs/outputs, keep backward-compatible alias if needed | Public schemas use one canonical field; aliases documented and deprecated with timeline |
| H-05 | `mantle_waitForReceipt` vs T1 stateless tenet | Polling tool exists but T1 currently reads as universal pure function | Define `waitForReceipt` as explicit T1 exception (or remove in favor of skill-level polling) | Tenet text and tool docs are non-contradictory; operational guidance for long polling is explicit |
| M-01 | Token-list availability single point of failure | One canonical token-list URL with strict tx-building dependency | Add fallback strategy (`MANTLE_TOKEN_LIST_FALLBACK_URL` and/or bundled pinned snapshot) with explicit freshness warnings | Documented failover path; CI/tests cover primary-down behavior |
| M-02 | No explicit approval revocation pattern | Revocation is implicit via approve-to-zero, not documented | Document `mantle_buildApproveTx(amount=\"0\")` revocation flow; optionally add `mantle_buildRevokeTx` alias | Portfolio/risk prompts include concrete revoke steps; examples show zero-approve revocation |
| M-03 | No sequence builder for multi-step tx workflows | Approve/swap/liquidity multi-step handled manually | Add sequence guidance (wait-for-receipt between steps) and evaluate `mantle_buildTxSequence` for ordered unsigned tx sets | Spec includes canonical multi-step orchestration pattern; optional sequence tool decision recorded |
| M-04 | Tool merge has no duplicate-name guard | Flat merge can overwrite duplicate tool names silently | Add startup duplicate-name assertion in server wiring | Server fails fast on collisions; test covers duplicate detection |
| M-05 | HTTP/SSE transport implementation details missing | Design claims dual transport but wiring example is stdio-centric | Add full HTTP/SSE server wiring section (auth, CORS, lifecycle, limits) or scope HTTP to later phase explicitly | Transport docs match implementation scope; no “advertised but unspecified” path |
| M-06 | ABI resource count/discovery mismatch | Resource table shows `abis/{name}` as `1 (templated)` while explicit names are listed | Clarify discovery model and count policy (templated vs enumerated) in resource section | Resource count semantics are consistent with list/read behavior |
| M-07 | Observability not specified | No explicit logging/metrics/tracing contract | Add baseline observability section (`MANTLE_LOG_LEVEL`, structured stderr logs, per-tool latency/error metrics) | Operators can monitor tool calls, latency, error rates without guessing |

### 12.2 Priority Guidance

1. Implement C-02 before production release.
2. Implement H-04 and H-05 before broad external agent rollout.
3. Implement M-series items as part of hardening milestones (security/ops first: M-01, M-04, M-05, M-07).

---

## 13. Release Tracking Snapshot

This section mirrors `v0.1-core` from `specs/mcp-release-plan.md` for in-spec progress tracking.
Keep both files synchronized when checking items.

Status legend:
- `[ ]` not done
- `[x]` done

### 13.1 v0.1-core Mirror

#### Server/Transport
- [ ] Establish `src/index.ts` / `src/server.ts` with modular tool/resource/prompt registration
- [ ] Enable `stdio` transport as the default and only v0.1 transport
- [ ] Keep `mcp.serverUseInstructions` and `SERVER_INSTRUCTIONS.md` fully aligned

#### Core Read Tools
- [ ] `mantle_getChainInfo`
- [ ] `mantle_getChainStatus`
- [ ] `mantle_resolveAddress` (unified `network`, backward-compat alias handling)
- [ ] `mantle_validateAddress`
- [ ] `mantle_getBalance`
- [ ] `mantle_getTokenBalances`
- [ ] `mantle_getAllowances`
- [ ] `mantle_getTokenInfo`
- [ ] `mantle_resolveToken` (quick-ref + canonical token-list double-check)
- [ ] `mantle_getTokenPrices` (valuation source; no fabricated values)

#### Core Resources
- [ ] `mantle://chain/mainnet`
- [ ] `mantle://chain/sepolia`
- [ ] `mantle://registry/contracts`
- [ ] `mantle://registry/tokens`
- [ ] `mantle://registry/protocols` (v1 enabled: `agni`, `merchant_moe`, `aave_v3`; `ondo` planned post-v1)

#### v0.1 Acceptance
- [ ] Core tool unit tests pass
- [ ] Schema definitions and prompt examples are consistent
- [ ] README/config examples run successfully in local `stdio` mode

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
| 9 | `mantle_getTokenPrices` | Token | portfolio-analyst, risk-evaluator, defi-operator |
| 10 | `mantle_resolveToken` | Token | defi-operator, risk-evaluator |
| 11 | `mantle_querySubgraph` | Indexer | data-indexer |
| 12 | `mantle_queryIndexerSql` | Indexer | data-indexer |
| 13 | `mantle_getSwapQuote` | DeFi Read | risk-evaluator, defi-operator |
| 14 | `mantle_getPoolLiquidity` | DeFi Read | risk-evaluator |
| 15 | `mantle_getLendingMarkets` | DeFi Read | defi-operator |
| 16 | `mantle_simulateTx` | Simulation | tx-simulator, risk-evaluator, deployer |
| 17 | `mantle_decodeCalldata` | Simulation | tx-simulator |
| 18 | `mantle_decodeError` | Simulation | tx-simulator, readonly-debugger |
| 19 | `mantle_checkRpcHealth` | Diagnostics | readonly-debugger |
| 20 | `mantle_probeEndpoint` | Diagnostics | readonly-debugger |
| 21 | `mantle_buildTransferTx` | Tx Build | defi-operator |
| 22 | `mantle_buildApproveTx` | Tx Build | defi-operator |
| 23 | `mantle_buildSwapTx` | Tx Build | defi-operator |
| 24 | `mantle_buildLiquidityTx` | Tx Build | defi-operator |
| 25 | `mantle_buildLendingTx` | Tx Build | defi-operator |
| 26 | `mantle_buildDeployTx` | Tx Build | smart-contract-deployer |
| 27 | `mantle_getTransactionReceipt` | Tx Monitor | defi-operator, deployer |
| 28 | `mantle_waitForReceipt` | Tx Monitor | defi-operator, deployer |
| 29 | `mantle_verifyContract` | Explorer | smart-contract-deployer |
| 30 | `mantle_checkVerification` | Explorer | smart-contract-deployer |
| 31 | `mantle_getExplorerUrl` | Explorer | smart-contract-deployer |
