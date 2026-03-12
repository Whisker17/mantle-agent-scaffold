# mantle-agent-scaffold

`mantle-agent-scaffold` is the repository for the Mantle MCP server plus the pinned `skills/` checkout used by external agents and MCP-capable clients.

Use the root README as a fast integration guide. Use the docs site for architecture, workflow rules, and detailed operational guidance.

## Quick Start

```bash
npm install
npm run skills:init
npm run build
MANTLE_MCP_TRANSPORT=stdio npm start
```

This starts the Mantle MCP server over stdio from `dist/index.js`.

For most clients, the first reliable sequence is:

1. Discover capabilities with `listTools`, `listResources`, and `listPrompts`.
2. Load any required context with `readResource` or `getPrompt`.
3. Execute tool calls with schema-valid arguments.
4. Ground final output in MCP responses rather than free-form guesses.

## Use The Skills Checkout

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

Minimal usage pattern:

1. Choose the skill that matches the user task.
2. Read `skills/skills/<skill-name>/SKILL.md`.
3. Apply the skill checklist before calling Mantle tools.

## Minimal MCP Client Config

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
- [External Agent Integration](https://mantle-xyz.github.io/mantle-agent-scaffold/concepts/external-agents/) for integration rules and execution flow
- [Testing Philosophy](https://mantle-xyz.github.io/mantle-agent-scaffold/concepts/testing/) for validation and release expectations
- [Architecture Model](https://mantle-xyz.github.io/mantle-agent-scaffold/concepts/architecture/) for runtime structure and safety boundaries

If you are maintaining the docs site itself, the source lives in `docs/`.
