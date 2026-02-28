# mantle-mcp (v0.1-core)

MCP server for Mantle L2 with stdio transport and core read-only tools.

## Implemented in v0.1

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
