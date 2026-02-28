# Mantle MCP v0.2 Readplus Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver `v0.2-readplus` from `specs/mcp-release-plan.md` with DeFi read tools, indexer tools, diagnostics tools, early prompts/resources, tests, and release checklist updates.

**Architecture:** Extend the v0.1 modular server by adding dedicated tool modules (`defi-read`, `indexer`, `diagnostics`) plus shared endpoint safety validation and prompt/resource expansion. Keep all additions read-only and fail closed on unsafe endpoints or unavailable data.

**Tech Stack:** Node.js 18+, TypeScript (ESM), @modelcontextprotocol/sdk, viem, Vitest

---

### Task 1: Add Failing Tests For v0.2 Contracts

**Files:**
- Create: `tests/defi-read-tools.test.ts`
- Create: `tests/indexer-tools.test.ts`
- Create: `tests/diagnostics-tools.test.ts`
- Create: `tests/prompts-v0-2.test.ts`
- Modify: `tests/resources.test.ts`
- Modify: `tests/server-wiring.test.ts`

### Task 2: Implement v0.2 Tools

**Files:**
- Create: `src/tools/defi-read.ts`
- Create: `src/tools/indexer.ts`
- Create: `src/tools/diagnostics.ts`
- Create: `src/lib/endpoint-policy.ts`
- Modify: `src/tools/index.ts`

### Task 3: Implement v0.2 Resources And Prompts

**Files:**
- Modify: `src/resources.ts`
- Modify: `src/prompts.ts`

### Task 4: Verification And Release Checklist

**Files:**
- Modify: `specs/mcp-release-plan.md`

Run:
- `npm run typecheck`
- `npm test -- --run`
