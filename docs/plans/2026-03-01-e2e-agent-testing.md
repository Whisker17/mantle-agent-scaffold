# Mantle MCP E2E Agent Testing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement release-stage E2E agent tests that validate natural-language tool selection and MCP end-to-end wiring across all 17 v0.2 tools.

**Architecture:** Add a dedicated `e2e/` test suite that boots the real MCP server in-memory, adapts `ListTools` schemas into AI SDK tools, drives scenarios with `generateText`, applies layered assertions/retries, and prints a structured run report.

**Tech Stack:** TypeScript (ESM), Vitest, `@modelcontextprotocol/sdk`, `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`

---

### Task 1: Create RED-state E2E Harness Test

**Files:**
- Create: `e2e/agent-e2e.test.ts`
- Create: `vitest.e2e.config.ts`
- Modify: `package.json`

### Task 2: Implement Scenario Registry

**Files:**
- Create: `e2e/scenarios/chain.scenarios.ts`
- Create: `e2e/scenarios/registry.scenarios.ts`
- Create: `e2e/scenarios/account.scenarios.ts`
- Create: `e2e/scenarios/token.scenarios.ts`
- Create: `e2e/scenarios/defi-read.scenarios.ts`
- Create: `e2e/scenarios/indexer.scenarios.ts`
- Create: `e2e/scenarios/diagnostics.scenarios.ts`
- Create: `e2e/scenarios/index.ts`

### Task 3: Implement Shared E2E Runtime

**Files:**
- Create: `e2e/lib/model.ts`
- Create: `e2e/lib/tool-adapter.ts`
- Create: `e2e/lib/runner.ts`

### Task 4: Complete E2E Entry Test And Config Wiring

**Files:**
- Modify: `e2e/agent-e2e.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`

### Task 5: Verification

Run:
- `npm run test:e2e`
- `npm run typecheck`
- `npm test -- --run`
