# CLI

This directory contains `mantle-cli`, the local command-line interface for the same Mantle read capabilities exposed by the MCP server.

Use the CLI when you want a quick shell-oriented workflow without wiring an MCP client:

- inspect chain metadata and RPC health
- resolve registry entries and token symbols
- query balances, allowances, and token prices
- inspect DeFi routes, pools, TVL, and lending markets
- run indexer queries and diagnostics from the terminal

Typical commands:

```bash
node dist/cli/index.js chain info
node dist/cli/index.js registry resolve USDC --json
node dist/cli/index.js account balance 0x1234... --json
node dist/cli/index.js token prices --tokens USDC,WETH --json
node dist/cli/index.js diagnostics rpc-health
```

Command name after installation:

```bash
mantle-cli --help
```

The CLI shares underlying Mantle tool logic with the MCP server, so it is useful for smoke tests and manual verification. For deeper integration guidance, see the root [README](../README.md) and the docs site.
