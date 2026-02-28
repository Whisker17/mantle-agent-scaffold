# MCP Design Spec - Independent Review

Reviewed on: 2026-02-28
Reviewer: Opus 4.6
Target: `specs/mcp-design.md` (3360 lines, post-Codex-5.3-patch)

## Scope

- Transaction schema correctness and completeness (unsigned_tx fields, gas model)
- Simulation workflow coherence (who simulates, when, how many times)
- V3 concentrated liquidity coverage for Agni Finance (primary DEX)
- Security surface of agent-provided endpoint parameters
- Internal consistency of the statelessness tenet (T1) with actual tool behavior
- Missing tools / capabilities implied but not provided
- Parameter naming consistency across the 30-tool surface

## Summary

The design is thorough and well-structured. The 6-tenet philosophy, skill/tool separation, and eth-mcp-aligned wiring are sound foundations. However, I found **3 critical**, **5 high**, and **6 medium** issues that range from schema bugs that would cause runtime failures to architectural gaps that would force undocumented workarounds during implementation.

The Codex 5.3 review correctly identified consistency and safety issues. This review focuses on a different axis: **whether an implementer can build a working MCP server from this spec without making undocumented decisions**.

---

## Findings (ordered by severity)

### Critical

#### [C-01] `mantle_simulateTx` schema declares `to: z.string()` but deployment simulation requires `to: null`

- Location:
  - `mcp-design.md:1302-1303` (simulateTx input schema: `to: z.string()`)
  - `mcp-design.md:2542-2547` (deployment prompt example: `to: null`)
  - `mcp-design.md:1686` (buildDeployTx output: `to: null`)
- Problem:
  - Contract deployment transactions have `to: null`. The current schema `to: z.string()` rejects null, meaning deployment simulation is impossible through the declared API.
  - The deploy workflow prompt (7.3, Step 2) shows `mantle_simulateTx` called with `to: null`, which would fail schema validation.
- Risk:
  - Implementer must silently deviate from spec. Agent callers will hit validation errors when following the documented deployment workflow.
- Recommendation:
  - Change to `to: z.string().nullable()` or `to: z.string().optional()` with explicit documentation that `null`/absent means contract creation.
  - Add `null` handling in the simulateTx implementation notes.

---

#### [C-02] `unsigned_tx` output missing `nonce` and EIP-1559 gas pricing fields

- Location:
  - `mcp-design.md:1484-1491` (buildTransferTx output)
  - All `mantle_build*Tx` tools share the same `unsigned_tx` shape: `{ to, data, value, gas_limit, chain_id }`
- Problem:
  - **Nonce**: Not included in the output. For multi-step workflows (approve → swap), the signing wallet needs to know which nonce each transaction should use. Without nonce management, an agent building two sequential unsigned transactions cannot guarantee ordering.
  - **Gas pricing**: Only `gas_limit` is provided. Mantle (OP Stack) supports EIP-1559 transactions with `maxFeePerGas` and `maxPriorityFeePerGas`. The current schema produces a legacy-format transaction that may not be optimal.
  - The simulation output does include `gas_price_wei` and `estimated_fee_mnt`, but these don't flow into the unsigned tx structure.
- Risk:
  - Wallets receiving the unsigned tx must independently fetch nonce and gas price, duplicating work the MCP server already performed during simulation. In multi-tx workflows, nonce gaps or collisions are possible.
- Recommendation:
  - Extend `unsigned_tx` to:
    ```
    unsigned_tx: {
      to: string | null,
      data: string,
      value: string,
      gas_limit: string,
      chain_id: number,
      nonce: number | null,           // null if server cannot determine (no from-address nonce query)
      max_fee_per_gas: string | null, // EIP-1559; null to let wallet decide
      max_priority_fee_per_gas: string | null,
      type: 0 | 2,                    // legacy or EIP-1559
    }
    ```
  - If nonce management is intentionally excluded, document why and specify that the signing wallet is responsible for nonce assignment.

---

#### [C-03] Double-simulation ambiguity -- SERVER_INSTRUCTIONS mandate separate simulation, but build tools simulate internally

- Location:
  - `mcp-design.md:104-111` (SERVER_INSTRUCTIONS Rule 3: "ALWAYS simulate a transaction before presenting it")
  - `mcp-design.md:1458-1464` (Section 5.9: build tools include `simulation` in output)
  - `mcp-design.md:3108-3119` (Section 9.3: build tools internally execute simulation as step 3)
  - `mcp-design.md:2750-2753` (Risk Preflight Check 7: "mantle_simulateTx with the intended calldata")
- Problem:
  - The build tools already simulate internally and return the result in `simulation: { success, gas_used, ... }`. But SERVER_INSTRUCTIONS Rule 3 says "ALWAYS simulate before presenting", and the risk preflight prompt (7.5) calls `mantle_simulateTx` separately as Check 7.
  - This means a standard swap workflow involves **three** simulations:
    1. `mantle_simulateTx` during risk preflight (Check 7)
    2. Internal simulation inside `mantle_buildSwapTx`
    3. SERVER_INSTRUCTIONS say "simulate before presenting" (implying yet another call?)
  - Wasteful RPC calls, inconsistent behavior if chain state changes between simulations, and unclear which simulation result the agent should trust.
- Risk:
  - Implementers will be confused about the canonical workflow. Agents will either over-simulate (wasting RPC calls) or under-simulate (skipping one, violating a rule).
- Recommendation:
  - Define a clear simulation policy:
    - **Option A (recommended)**: Build tools simulate internally. SERVER_INSTRUCTIONS Rule 3 is satisfied by the `simulation` field in the build response. No separate `mantle_simulateTx` call needed for build workflows. Risk preflight Check 7 uses the build tool's `simulation` output rather than a separate call.
    - **Option B**: Build tools do NOT simulate internally. Simulation is always a separate preceding step via `mantle_simulateTx`. Build tools accept a `skip_simulation: boolean` flag.
  - Whichever option is chosen, update SERVER_INSTRUCTIONS, the risk preflight prompt, and the build tool descriptions to be consistent.
  - Document that `mantle_simulateTx` remains independently useful for: (a) simulating arbitrary calldata not built by a build tool, (b) re-simulating with different state overrides, (c) debugging.

---

### High

#### [H-01] SSRF risk in indexer and diagnostics tools accepting arbitrary endpoint URLs

- Location:
  - `mcp-design.md:1134` (`mantle_querySubgraph`: `endpoint: z.string()`)
  - `mcp-design.md:1158` (`mantle_queryIndexerSql`: `endpoint: z.string()`)
  - `mcp-design.md:1436` (`mantle_probeEndpoint`: `rpc_url: z.string()`)
  - `mcp-design.md:1412` (`mantle_checkRpcHealth`: `rpc_url: z.string().optional()`)
- Problem:
  - Four tools accept arbitrary URLs from the agent. An adversarial or confused agent could probe internal network services (`http://169.254.169.254/metadata`, `http://localhost:8080/admin`, etc.).
  - Section 9.4 covers SQL mutation rejection and timeouts, but says nothing about URL validation, protocol restrictions, or network boundary protection.
- Risk:
  - Server-Side Request Forgery (SSRF) through the MCP server. Especially dangerous in remote/HTTP transport mode where the MCP server runs on shared infrastructure.
- Recommendation:
  - Add a URL validation layer for all agent-provided endpoints:
    - Protocol allowlist: `https://` only (or `http://` only for explicitly configured local endpoints).
    - Reject private IP ranges: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `127.x.x.x`, `169.254.x.x`, `::1`, `fd00::/8`.
    - Reject cloud metadata endpoints explicitly.
  - Add `MANTLE_ALLOWED_ENDPOINT_DOMAINS` env var for operators to restrict which external services the tools can contact.
  - Document this in the Security Model (section 9).

---

#### [H-02] `mantle_buildLiquidityTx` ignores concentrated liquidity parameters -- unusable for Agni Finance (primary DEX)

- Location:
  - `mcp-design.md:1585-1619` (buildLiquidityTx schema)
  - `mcp-design.md:2871` ("Agni Finance | DEX | Uniswap V3 fork, concentrated liquidity")
- Problem:
  - Agni Finance is described as a Uniswap V3 fork with concentrated liquidity. V3 liquidity provision requires `tickLower`/`tickUpper` (or equivalent `priceLower`/`priceUpper`) parameters to define the price range. The current schema only has `token_a_amount`, `token_b_amount`, and `slippage_bps` -- these are V2-style AMM parameters.
  - Merchant Moe (Liquidity Book / Joe V2 fork) has its own bin-based parameters.
  - The tool cannot serve its primary use case on Mantle's primary DEX.
- Risk:
  - The tool is effectively broken for Agni concentrated liquidity. Implementers will either build a non-functional tool or silently extend the schema, diverging from spec.
- Recommendation:
  - Add V3 concentrated liquidity parameters:
    ```
    // For V3-style (Agni):
    price_lower: z.string().optional()    // human-readable price bound
    price_upper: z.string().optional()    // human-readable price bound
    // Alternative tick-based input:
    tick_lower: z.number().optional()
    tick_upper: z.number().optional()
    // For full-range:
    full_range: z.boolean().default(false)
    ```
  - Document that when `provider="agni"`, at least one of (price range, tick range, full_range=true) is required.
  - Consider whether Merchant Moe's Liquidity Book needs its own parameter set (bin step, bin IDs), or whether to scope the tool to V3-style only and add a separate tool for LB.

---

#### [H-03] No price feed or USD valuation tool, but prompts and resources reference USD amounts

- Location:
  - `mcp-design.md:2373-2377` (Portfolio audit prompt: "USD Equivalent" column)
  - `mcp-design.md:1243` (getPoolLiquidity: `total_liquidity_usd: number | null`)
  - `mcp-design.md:1275` (getLendingMarkets: `tvl_usd: number | null`)
  - `mcp-design.md:2725` (Risk preflight: "BLOCK if total_liquidity_usd < $10,000")
- Problem:
  - Multiple tools and prompts reference USD valuations, but there is no `mantle_getTokenPrice` or price feed tool. The portfolio audit prompt includes a "USD Equivalent" column with no way to populate it. The risk preflight blocks on `total_liquidity_usd < $10,000` but this field is nullable.
  - `total_liquidity_usd` and `tvl_usd` appear in output schemas as nullable, implying they sometimes cannot be computed. But the risk preflight treats `total_liquidity_usd` as a reliable blocking condition.
- Risk:
  - Agents will fabricate USD values (violating T3) or leave them blank (degrading the portfolio audit UX). The risk preflight check on liquidity_usd cannot reliably function.
- Recommendation:
  - Add a `mantle_getTokenPrices` tool:
    ```
    Input:
      tokens: z.array(z.string())      // addresses or symbols
      base_currency: z.enum(["usd", "mnt"]).default("usd")
      network: z.enum(["mainnet", "sepolia"]).default("mainnet")
    Output:
      {
        prices: [{ token, symbol, price, source, confidence, ... }],
        source: "dex_quote" | "oracle" | "coingecko",
        ...
      }
    ```
  - Alternatively, document that USD valuation is out of scope and remove all USD references from prompts, tool outputs, and risk preflight thresholds. Replace the liquidity check with a token-denominated threshold.

---

#### [H-04] Inconsistent parameter naming: `token` vs `asset` across the tool surface

- Location:
  - `mcp-design.md:1479` (buildTransferTx: `token`)
  - `mcp-design.md:1515` (buildApproveTx: `token`)
  - `mcp-design.md:1552-1553` (buildSwapTx: `token_in`, `token_out`)
  - `mcp-design.md:1635` (buildLendingTx: `asset`)
  - `mcp-design.md:1262` (getLendingMarkets: `asset`)
  - `mcp-design.md:1067` (getTokenInfo: `token`)
  - `mcp-design.md:1025` (getAllowances pairs: `token`)
- Problem:
  - Lending tools use `asset` while all other tools use `token` for the same concept (an ERC-20 token identifier). An AI agent must learn two different parameter names for the same type of input.
- Risk:
  - Agent confusion, increased prompt engineering burden, and higher error rate in tool calls.
- Recommendation:
  - Standardize on `token` everywhere. `asset` is an Aave-ism that doesn't need to leak into the MCP API surface. The tool description can note "the collateral/lending asset (token symbol or address)" without using a different parameter name.
  - If `asset` is kept for lending tools, add it to a "parameter naming conventions" section and document the rationale.

---

#### [H-05] `mantle_waitForReceipt` violates T1 statelessness by maintaining an internal polling loop

- Location:
  - `mcp-design.md:37` (T1: "Every MCP tool is a pure function")
  - `mcp-design.md:1739-1757` (waitForReceipt: polls with timeout and interval)
- Problem:
  - `mantle_waitForReceipt` maintains state across time (polling counter, elapsed time tracking). It is a long-running blocking call, not a pure function. It holds a process thread for up to 60 seconds by default.
  - This is architecturally different from every other tool in the catalog and contradicts the statelessness tenet.
- Risk:
  - In HTTP/SSE transport, a 60-second blocking call may trigger proxy timeouts or connection resets. Resource exhaustion if many agents wait simultaneously. Implementers may be surprised by the non-stateless behavior.
- Recommendation:
  - **Option A (pragmatic, recommended)**: Keep `waitForReceipt` but acknowledge it as an intentional exception to T1. Add a note: "This tool is a convenience wrapper that internally polls `getTransactionReceipt`. It is the only tool that maintains temporal state. For stateless alternatives, agents can implement polling at the skill level using `mantle_getTransactionReceipt` with agent-managed retries."
  - **Option B (purist)**: Remove `waitForReceipt` and let skills orchestrate polling using repeated `getTransactionReceipt` calls. This is more work for skills but cleaner architecturally.

---

### Medium

#### [M-01] Token-list single point of failure with no redundancy

- Location:
  - `mcp-design.md:501` (MANTLE_TOKEN_LIST_URL: `https://token-list.mantle.xyz`)
  - `mcp-design.md:505` (Tx-building hard-fails when token-list is unavailable)
- Problem:
  - All transaction-building is blocked when a single URL is unreachable. No mirror URL, no fallback snapshot, no CDN failover strategy.
- Recommendation:
  - Add `MANTLE_TOKEN_LIST_FALLBACK_URL` env var.
  - Ship a pinned snapshot in the package (`dist/token-list-snapshot.json`) as a last-resort fallback with a strong warning.
  - Document the expected SLA for `token-list.mantle.xyz`.

---

#### [M-02] No approval revocation pattern or tool

- Location:
  - `mcp-design.md:1505-1538` (buildApproveTx)
  - `mcp-design.md:2161-2164` (Safety Rule 3: "Warn if existing unlimited allowance detected")
  - `mcp-design.md:2379-2381` (Portfolio audit prompt: "WARN: consider revoking")
- Problem:
  - The portfolio audit detects unlimited allowances and suggests revoking, but there's no documented way to do it. `mantle_buildApproveTx` with `amount: "0"` would work, but this pattern is not specified.
- Recommendation:
  - Add explicit documentation: "`mantle_buildApproveTx` with `amount: "0"` builds a revocation transaction. The `human_summary` should read 'Revoke USDC approval for Agni Router (0x319B...8421)'."
  - Optionally add a convenience alias: `mantle_buildRevokeTx` that wraps `buildApproveTx(amount: "0")`.

---

#### [M-03] No batch transaction or sequencing support for multi-step workflows

- Location:
  - `mcp-design.md:2447-2461` (Swap workflow: approve FIRST, then swap)
  - `mcp-design.md:1612-1613` (buildLiquidityTx: may need 1-2 approvals)
- Problem:
  - Many workflows require ordered sequences (approve → swap, approve × 2 → add liquidity). Each step requires a separate tool call, user confirmation, signing, and receipt waiting. There's no batch builder or tx sequencer.
  - Without nonce management (C-02), the agent cannot even guarantee ordering when presenting multiple unsigned txs.
- Recommendation:
  - Consider a `mantle_buildTxSequence` tool that returns an ordered array of unsigned txs with correct nonces and dependencies annotated. This would reduce round-trips and make multi-step workflows atomic from the agent's perspective.
  - If out of scope for v1, document the pattern explicitly: "Multi-step workflows must be executed sequentially. The agent should wait for each transaction's receipt before building the next."

---

#### [M-04] Flat tool merge in `server.ts` has no collision detection

- Location:
  - `mcp-design.md:344-356` (allTools merge pattern)
- Problem:
  - If two modules export tools with the same `name`, the later spread silently overwrites the earlier one. With 11 modules and 30 tools, this is a real risk during development.
- Recommendation:
  - Add a startup assertion:
    ```
    const names = Object.values(allTools).map(t => t.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length) throw new Error(`Duplicate tool names: ${dupes.join(", ")}`);
    ```
  - Mention this guard in the spec.

---

#### [M-05] HTTP/SSE transport architecture not specified

- Location:
  - `mcp-design.md:242` (Streamable HTTP + SSE listed as supported transport)
  - `mcp-design.md:244` (MANTLE_MCP_TRANSPORT env var)
  - `mcp-design.md:433-443` (Server wiring only shows StdioServerTransport)
- Problem:
  - The spec promises dual transport but only provides implementation detail for stdio. How does the HTTP transport instantiate? What middleware is used? How are CORS, authentication, and connection lifecycle handled?
- Recommendation:
  - Add an HTTP transport wiring example parallel to the stdio one, or mark HTTP transport as "Phase 2" and remove it from the v0.1.0 package spec to avoid spec-implementation mismatch.

---

#### [M-06] ABI resource count is misleading

- Location:
  - `mcp-design.md:2268` (ABIs: "1 (templated)")
  - `mcp-design.md:2016-2025` (9 named ABIs listed)
- Problem:
  - The resource count table says 1, but there are 9 distinct ABI resources. The `listResources()` function must return all 9 individually for agents to discover them.
- Recommendation:
  - Update the count to 9 (one per ABI) with a note that new ABIs extend this count. Or redesign as a single `mantle://abis` resource that returns the full map, with individual URIs as convenience aliases.

---

#### [M-07] No observability, logging, or metrics specification

- Problem:
  - For a production MCP server, there's no mention of structured logging, error reporting, tool invocation metrics, or tracing. Operators cannot monitor which tools are called, how often, or what error rates look like.
- Recommendation:
  - Add a brief observability section:
    - Structured JSON logging to stderr (not stdout, to avoid polluting stdio transport).
    - Tool call counter + latency histogram (emitted via stderr or a metrics endpoint in HTTP mode).
    - Optional `MANTLE_LOG_LEVEL` env var (default: `warn`).

---

## Summary Table

| ID | Severity | Title | Nature |
|----|----------|-------|--------|
| C-01 | Critical | simulateTx schema rejects `to: null` for deployments | Schema bug |
| C-02 | Critical | unsigned_tx missing nonce and EIP-1559 gas fields | Schema gap |
| C-03 | Critical | Double/triple simulation ambiguity | Workflow incoherence |
| H-01 | High | SSRF risk in indexer and diagnostics tools | Security |
| H-02 | High | buildLiquidityTx unusable for V3 concentrated liquidity | Feature gap |
| H-03 | High | No price feed tool despite USD references everywhere | Missing tool |
| H-04 | High | Inconsistent `token` vs `asset` parameter naming | API consistency |
| H-05 | High | waitForReceipt violates T1 statelessness | Tenet contradiction |
| M-01 | Medium | Token-list single point of failure | Operational risk |
| M-02 | Medium | No approval revocation pattern | Documentation gap |
| M-03 | Medium | No batch transaction or sequencing support | Feature gap |
| M-04 | Medium | No tool name collision detection | Implementation risk |
| M-05 | Medium | HTTP transport not specified | Spec gap |
| M-06 | Medium | ABI resource count misleading | Documentation |
| M-07 | Medium | No observability specification | Operational gap |

---

## Relationship to Codex 5.3 Review

The Codex review and this review are complementary with no contradictions:

| Codex Focus | Opus Focus |
|-------------|------------|
| Token-list safety policy (C-01, C-02) | Transaction schema correctness (C-01, C-02) |
| Naming consistency (`network` enum) | Naming consistency (`token`/`asset` params) |
| Tool count and address placeholders | Tool schema completeness and missing tools |
| CI synchronization | Security model (SSRF, URL validation) |
| Lending health-factor thresholds | V3 concentrated liquidity parameters |

Both reviews should be addressed together. There is one area of overlap: Codex M-01 (determinism vs remote token-list) relates to this review's M-01 (token-list SPOF), but from different angles (determinism vs availability).

---

## Suggested Priority Order

1. **C-01 + C-02**: Fix unsigned_tx schema and simulateTx `to` parameter. These are blocking for implementation.
2. **C-03**: Resolve simulation workflow ambiguity. Must be decided before writing SERVER_INSTRUCTIONS or build tool implementations.
3. **H-01**: Add SSRF protection. Security issue that must be designed before first implementation.
4. **H-02**: Extend buildLiquidityTx for V3 concentrated liquidity. Core DEX functionality.
5. **H-03**: Decide on price feed tool vs removing USD references. Affects multiple prompts and tool outputs.
6. **H-04 + H-05**: Naming fix and waitForReceipt exception documentation. Low effort, high clarity.
7. **M-01 through M-07**: Address in any order alongside implementation.
