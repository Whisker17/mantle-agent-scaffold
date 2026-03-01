# mantle-mcp (v0.2.6)

MCP server for Mantle L2 with stdio transport and core read-only tools.

## Quick Start

```bash
npm install
npm run build
MANTLE_MCP_TRANSPORT=stdio npm start
```

## Implemented Surface

Server and transport:
- `src/index.ts`
- `src/server.ts`
- stdio runtime (`MANTLE_MCP_TRANSPORT=stdio`)

MCP interfaces:
- `listTools`
- `callTool`
- `listResources`
- `readResource`
- `listPrompts`
- `getPrompt`

Tools:
- Chain: `mantle_getChainInfo`, `mantle_getChainStatus`
- Registry: `mantle_resolveAddress`, `mantle_validateAddress`
- Account: `mantle_getBalance`, `mantle_getTokenBalances`, `mantle_getAllowances`
- Token: `mantle_getTokenInfo`, `mantle_getTokenPrices`, `mantle_resolveToken`
- DeFi Read: `mantle_getSwapQuote`, `mantle_getPoolLiquidity`, `mantle_getLendingMarkets`
- Indexer: `mantle_querySubgraph`, `mantle_queryIndexerSql`
- Diagnostics: `mantle_checkRpcHealth`, `mantle_probeEndpoint`

Resources:
- `mantle://chain/mainnet`
- `mantle://chain/sepolia`
- `mantle://registry/contracts`
- `mantle://registry/tokens`
- `mantle://registry/protocols`
- `mantle://docs/network-basics`
- `mantle://docs/risk-checklist`

Prompts:
- `mantle_portfolioAudit`
- `mantle_mantleBasics`
- `mantle_gasConfiguration`

## How To Use mantle-mcp

Recommended operational flow for agents:

1. Discover capabilities:
   - `listTools`
   - `listResources`
   - `listPrompts`
2. Load context before action:
   - `readResource` for needed `mantle://...` URIs
   - `getPrompt` for workflow templates
3. Execute tool calls via `callTool` with schema-valid arguments.
4. Use structured tool outputs as source-of-truth in final responses.

Recommended call order for most workflows:

1. `mantle_getChainInfo` / `mantle_getChainStatus`
2. `mantle_resolveAddress` / `mantle_resolveToken`
3. Domain tools (account, token, defi-read, indexer)
4. Diagnostics (`mantle_checkRpcHealth`, `mantle_probeEndpoint`) when endpoint reliability is unclear

## How To Use Skills (`skills/`)

Each local skill is in `skills/<name>/SKILL.md` with references and agent config.

Use them as workflow drivers:

| Skill | Primary Use |
| --- | --- |
| `mantle-network-primer` | Mantle ecosystem and network onboarding |
| `mantle-address-registry-navigator` | Canonical address lookup and validation |
| `mantle-portfolio-analyst` | Wallet holdings and allowance exposure analysis |
| `mantle-data-indexer` | Subgraph + SQL data extraction workflows |
| `mantle-defi-operator` | DEX/lending read-oriented operation flows |
| `mantle-readonly-debugger` | Debugging tool failures and RPC/read issues |
| `mantle-risk-evaluator` | Risk scoring/checklist-driven decision support |
| `mantle-tx-simulator` | Simulation-first transaction planning |
| `mantle-smart-contract-deployer` | Deployment and verification checklists |

Practical workflow:

1. Choose a skill by task intent.
2. Read the skill's `SKILL.md`.
3. Follow the skill checklist.
4. Execute with mantle-mcp tools/resources/prompts.

## External Agents: Required Usage Contract

If you are integrating an external MCP-capable agent (for example, a hosted assistant runtime, IDE agent, or custom orchestration service), follow this contract.

### 1. Connect to `mantle-mcp`

Use stdio transport and launch `dist/index.js`:

```json
{
  "mcpServers": {
    "mantle": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "MANTLE_MCP_TRANSPORT": "stdio",
        "MANTLE_RPC_URL": "https://rpc.mantle.xyz",
        "MANTLE_SEPOLIA_RPC_URL": "https://rpc.sepolia.mantle.xyz"
      }
    }
  }
}
```

### 2. Load skills from this repository

External agents should treat `skills/` as workflow policy, not optional reference text:

1. Select skill by user intent.
2. Read `skills/<skill-name>/SKILL.md` before tool calls.
3. Apply the checklist and guardrails from that skill.
4. Use MCP outputs as source-of-truth for the final answer.

### 3. Mandatory call sequence for reliable results

1. `listTools`, `listResources`, `listPrompts`
2. `readResource` / `getPrompt` for needed context
3. `callTool` with schema-valid args
4. Summarize using tool outputs (never fabricate addresses, chain state, or prices)

### 4. Safety minimums for external agents

- Resolve identifiers first: `mantle_resolveAddress`, `mantle_resolveToken`
- Use `mantle_getChainStatus` before time-sensitive outputs
- For user-provided endpoints, rely on indexer/diagnostics policy checks
- Treat null prices as unknown, not zero

## URL and Interface Quick Reference

MCP interface purpose:

| Interface | Purpose |
| --- | --- |
| `listTools` | discover callable tools and schemas |
| `callTool` | execute one tool with structured args |
| `listResources` | discover context URIs |
| `readResource` | fetch concrete resource content |
| `listPrompts` | discover prompt templates |
| `getPrompt` | fetch prompt messages by name |

External endpoint interfaces:

| Variable/URL | Purpose |
| --- | --- |
| `MANTLE_RPC_URL` (`https://rpc.mantle.xyz`) | mainnet RPC override |
| `MANTLE_SEPOLIA_RPC_URL` (`https://rpc.sepolia.mantle.xyz`) | sepolia RPC override |
| `MANTLE_TOKEN_LIST_URL` (`https://token-list.mantle.xyz`) | canonical token list source |
| `E2E_SUBGRAPH_ENDPOINT` | GraphQL endpoint for indexer E2E scenario |
| `E2E_SQL_ENDPOINT` | SQL endpoint for indexer E2E scenario |
| `https://openrouter.ai/api/v1` | OpenRouter base URL in E2E openrouter mode |

Full interface mapping (including every resource URI and tool endpoint role):
- `docs/pages/spec/interfaces.mdx`

## Example MCP Client Config

```json
{
  "mcpServers": {
    "mantle": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "MANTLE_RPC_URL": "https://rpc.mantle.xyz",
        "MANTLE_SEPOLIA_RPC_URL": "https://rpc.sepolia.mantle.xyz"
      }
    }
  }
}
```

## Verification Commands

```bash
npm test -- --run
npm run typecheck
```

## E2E Agent Test

```bash
set -a
source .env
set +a

# Optional: skip indexer endpoint scenarios when endpoint is not ready
unset E2E_SUBGRAPH_ENDPOINT E2E_SQL_ENDPOINT

npm run test:e2e
```

Notes:
- `npm run test:e2e` does not auto-load `.env`; export env vars first.
- OpenRouter mode uses provider-compatible settings in runner (no `stopWhen`).

## Documentation Site (Nextra)

Source: `docs/`

```bash
npm run docs:dev
npm run docs:build
```

GitHub Pages:
- Site URL: `https://whisker17.github.io/mantle-agent-scaffold/`
- Workflow: `.github/workflows/docs-pages.yml`
- Trigger: push to `main` on `docs/**` (or manual workflow dispatch)
- Build output: static export from `docs/out`
