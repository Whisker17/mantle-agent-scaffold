# mantle-agent-scaffold

`mantle-agent-scaffold` packages three things together for external Mantle integrations: a pinned `skills/` checkout, the Mantle MCP server, and a local CLI built on the same read-oriented capabilities.

Use the root README as a fast map of the repository. Use the docs site for deeper architecture and workflow detail.

## Quick Start

```bash
npm install
npm run skills:init
npm run build
MANTLE_MCP_TRANSPORT=stdio npm start
```

This installs dependencies, initializes the pinned skills checkout, builds both entry points, and starts the MCP server from `dist/index.js`.

## Skills

The local `skills/` checkout is pinned to the external `mantle-xyz/mantle-skills` repository.

After cloning:

```bash
npm run skills:init
```

When you intentionally want to refresh the pinned checkout:

```bash
npm run skills:sync
```

Project skill definitions live under `skills/skills/<skill-name>/SKILL.md`.

Minimal usage pattern for external agents:

1. Choose the skill that matches the user task.
2. Read `skills/skills/<skill-name>/SKILL.md`.
3. Apply the skill checklist before calling Mantle tools.

More detail: [Skills and MCP Usage](https://mantle-xyz.github.io/mantle-agent-scaffold/concepts/skills/)

## MCP

The MCP server is the primary integration surface for hosted assistants, IDE agents, and custom orchestrators. It exposes Mantle chain, registry, account, token, DeFi-read, indexer, and diagnostics capabilities over stdio.

For most clients, the reliable execution sequence is:

1. Discover capabilities with `listTools`, `listResources`, and `listPrompts`.
2. Load required context with `readResource` or `getPrompt`.
3. Execute tool calls with schema-valid arguments.
4. Ground final output in MCP responses rather than free-form guesses.

Implementation overview: [`src/README.md`](src/README.md)

Minimal MCP client config:

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

More detail: [External Agent Integration](https://mantle-xyz.github.io/mantle-agent-scaffold/concepts/external-agents/)

## CLI

`mantle-cli` is a local command-line wrapper around the same Mantle read capabilities. It is useful for quick manual inspection, shell workflows, and validating tool behavior without wiring up an MCP client.

Examples:

```bash
node dist/cli/index.js chain info
node dist/cli/index.js registry resolve USDC --json
node dist/cli/index.js token prices --tokens USDC,WETH --json
```

Usage overview: [`cli/README.md`](cli/README.md)

## Verify

```bash
npm run typecheck
npm test
npm run docs:build
```

## Documentation

Documentation site: [mantle-xyz.github.io/mantle-agent-scaffold](https://mantle-xyz.github.io/mantle-agent-scaffold/)

- [Concepts](https://mantle-xyz.github.io/mantle-agent-scaffold/concepts/) for the high-level model
- [Skills and MCP Usage](https://mantle-xyz.github.io/mantle-agent-scaffold/concepts/skills/) for the skill-first operating model
- [MCP server overview](src/README.md) for the internal `src/` layout and capability summary
- [CLI overview](cli/README.md) for command-line usage and common commands
- [External Agent Integration](https://mantle-xyz.github.io/mantle-agent-scaffold/concepts/external-agents/) for integration rules and execution flow
- [Testing Philosophy](https://mantle-xyz.github.io/mantle-agent-scaffold/concepts/testing/) for validation and release expectations
- [Architecture Model](https://mantle-xyz.github.io/mantle-agent-scaffold/concepts/architecture/) for runtime structure and safety boundaries

If you are maintaining the docs site itself, the source lives in `docs/`.
