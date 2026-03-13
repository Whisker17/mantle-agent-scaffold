# MCP Server

This directory contains the Mantle MCP server implementation.

At a high level, the server exposes Mantle read-oriented capabilities for external agents over the Model Context Protocol:

- `chain` for network metadata and status
- `registry` for address resolution and validation
- `account` for balances and allowances
- `token` for metadata, resolution, and pricing
- `DeFi` for quotes, pool reads, protocol TVL, and lending-market views
- `indexer` for subgraph and SQL access with policy checks
- `diagnostics` for RPC health and endpoint probing

Main entry points:

- `index.ts` starts the MCP server
- `server.ts` wires tools, resources, and prompts together
- `tools/` contains callable MCP tool handlers
- `resources.ts` and `prompts.ts` expose reusable MCP context
- `lib/` contains shared Mantle and endpoint-policy helpers

Minimal local run:

```bash
npm run build
MANTLE_MCP_TRANSPORT=stdio npm start
```

If you are integrating an external client, start with the root [README](../README.md) for repository setup and the docs site for detailed protocols:

- [Skills and MCP Usage](https://mantle-xyz.github.io/mantle-agent-scaffold/concepts/skills/)
- [External Agent Integration](https://mantle-xyz.github.io/mantle-agent-scaffold/concepts/external-agents/)
- [Architecture Model](https://mantle-xyz.github.io/mantle-agent-scaffold/concepts/architecture/)
