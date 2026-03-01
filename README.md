# mantle-mcp (v0.2.6)

MCP server for Mantle L2 with stdio transport and core read-only tools.

## Implemented in v0.2

- Server/transport:
  - `src/index.ts`
  - `src/server.ts`
  - stdio-only runtime (`MANTLE_MCP_TRANSPORT=stdio`)
- Core tools:
  - `mantle_getChainInfo`
  - `mantle_getChainStatus`
  - `mantle_resolveAddress`
  - `mantle_validateAddress`
  - `mantle_getBalance`
  - `mantle_getTokenBalances`
  - `mantle_getAllowances`
  - `mantle_getTokenInfo`
  - `mantle_resolveToken`
  - `mantle_getTokenPrices`
- Core resources:
  - `mantle://chain/mainnet`
  - `mantle://chain/sepolia`
  - `mantle://registry/contracts`
  - `mantle://registry/tokens`
  - `mantle://registry/protocols`

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

## Run (stdio)

```bash
MANTLE_MCP_TRANSPORT=stdio npm start
```

## Test

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
- `npm run test:e2e` does not auto-load `.env`; you need to export env vars before running.
- OpenRouter mode uses provider-compatible settings in runner (no `stopWhen`).

## Documentation Site (Nextra)

- Source: `docs/`
- Local dev:

```bash
npm run docs:dev
```

- Production build:

```bash
npm run docs:build
```

- GitHub Pages URL (after deployment):
  - `https://whisker17.github.io/mantle-agent-scaffold/`

### GitHub Pages Deployment

- Workflow: `.github/workflows/docs-pages.yml`
- Trigger: push to `main` that changes `docs/**` (or manual workflow dispatch)
- Build output: static export from `docs/out`

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
