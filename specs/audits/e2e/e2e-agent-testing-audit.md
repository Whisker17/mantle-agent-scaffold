# Mantle MCP E2E Agent Testing Implementation Audit

**Audit Date:** 2026-03-01
**Implementation Scope:** E2E Agent Testing (design spec `specs/e2e-agent-testing.md` + plan `docs/plans/2026-03-01-e2e-agent-testing.md`)
**Implementor:** Codex 5.3
**Auditor:** Claude Opus (code-reviewer subagent + manual review)
**References:** `specs/e2e-agent-testing.md`, `docs/plans/2026-03-01-e2e-agent-testing.md`

---

## 1. Executive Summary

The E2E Agent Testing implementation delivers the structural scope defined in the spec: a dedicated `e2e/` directory with scenario registry, shared runner, tool adapter, model resolution, and a Vitest entry point. All 17 v0.2 tool scenarios are registered, TypeScript compiles cleanly, existing unit tests remain green (44/44), and the e2e dry run passes (scenario count assertion + live LLM test correctly skipped when env vars are absent).

The implementation is well-architected — the `E2EAgentRunner` class cleanly encapsulates setup/teardown lifecycle, template resolution, retry logic, and layered assertions. The `convertToAiSdkTools` adapter correctly bridges MCP tool schemas to Vercel AI SDK v6 tools via `jsonSchema()` + `tool()`. The scenario files are clean and faithful to the spec's catalog.

However, several issues require attention:

- **The `.env` file contains a real API key and `.gitignore` does not exclude `.env`**, creating a credential leak risk if this repository is ever pushed to a public remote.
- The implementation introduces useful but **undocumented interface extensions** (`containsAnyText`, `toolArgsMatchAny`, `openrouter` provider) that should be reflected back into the spec.
- The **test entry architecture** uses a single `it` + sequential loop instead of the spec's `it.each` pattern, changing failure reporting semantics.
- The **failure threshold** is stricter than spec (all-or-nothing vs ≥90% pass rate), which contradicts the spec's release gate design.
- **Token usage is lost on retry failures**, understating actual LLM cost in the report.

**Overall assessment:** Structurally complete and well-implemented; needs security fixes (C1), spec reconciliation (I1–I4), and minor improvements (M1–M6) before the E2E test suite can serve as a reliable release gate.

---

## 2. Compliance Matrix

### 2.1 Implementation Plan Task Checklist

| Task | Status | Notes |
|------|--------|-------|
| **Task 1: RED-state E2E Harness** | | |
| `e2e/agent-e2e.test.ts` created | ✅ | 51 lines, 2 test cases |
| `vitest.e2e.config.ts` created | ✅ | Matches spec §7.3 |
| `package.json` modified | ✅ | `test:e2e` script added |
| **Task 2: Scenario Registry** | | |
| `e2e/scenarios/chain.scenarios.ts` | ✅ | 2 scenarios |
| `e2e/scenarios/registry.scenarios.ts` | ✅ | 2 scenarios |
| `e2e/scenarios/account.scenarios.ts` | ✅ | 3 scenarios |
| `e2e/scenarios/token.scenarios.ts` | ✅ | 3 scenarios |
| `e2e/scenarios/defi-read.scenarios.ts` | ✅ | 3 scenarios (2 tool-error + 1 success) |
| `e2e/scenarios/indexer.scenarios.ts` | ✅ | 2 scenarios with skipUnless |
| `e2e/scenarios/diagnostics.scenarios.ts` | ✅ | 2 scenarios |
| `e2e/scenarios/index.ts` | ✅ | Aggregates all 17 scenarios |
| **Task 3: Shared E2E Runtime** | | |
| `e2e/lib/model.ts` | ✅ | 104 lines, adds `openrouter` beyond spec |
| `e2e/lib/tool-adapter.ts` | ✅ | 96 lines, clean MCP→AI SDK bridge |
| `e2e/lib/runner.ts` | ✅ | 485 lines, core runner + reporter |
| **Task 4: Config Wiring** | | |
| `tsconfig.json` updated | ✅ | `e2e/**/*.ts` in include array |
| `package.json` devDependencies | ✅ | `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/provider` added |
| **Task 5: Verification** | | |
| `npm run typecheck` | ✅ | Clean — verified by auditor |
| `npm test -- --run` | ✅ | 44/44 pass — verified by auditor |
| `npm run test:e2e` (dry) | ✅ | 1 pass, 1 skipped (no LLM env) — verified by auditor |

### 2.2 Spec §9.2 Implementation Acceptance Criteria

| Criterion | Status | Notes |
|-----------|--------|-------|
| `e2e/` directory structure matches §4.2 | ✅ | Exact match |
| `vitest.e2e.config.ts` independent from main config | ✅ | Separate include, timeout, retry settings |
| `npm run test:e2e` executable | ✅ | Verified; dry run passes |
| All 17 scenarios implemented | ✅ | Counted: 2+2+3+3+3+2+2 = 17 |
| Runner setup/teardown manages MCP lifecycle | ✅ | `E2EAgentRunner.setup()` / `teardown()` |
| Failure types produce clear errors | ✅ | 5 types: `TOOL_NOT_CALLED`, `WRONG_ARGS`, `ASSERTION_FAILED`, `TIMEOUT`, `LLM_ERROR` |
| Test report matches §7.6 | ⚠️ | Format matches, but token usage zeros on failed retries — see I4 |

---

## 3. Findings by Severity

### Critical

#### C1. `.env` contains real API key; `.gitignore` does not exclude `.env`

**Location:** `.env:3`, `.gitignore:1`

**Problem:** The `.env` file contains a live OpenRouter API key:

```
E2E_LLM_API_KEY=sk-or-v1-REDACTED
```

The `.gitignore` file only contains `node_modules` — it does not exclude `.env`, `.env.local`, or any other dotenv files.

**Impact:** If this repository is pushed to any remote (public or private), the API key is exposed. Even for private repos, credential-in-repo is a security anti-pattern — any collaborator, CI system, or compromised account gains access. The key grants OpenRouter API access which can be used to make LLM calls billed to the key owner.

**Recommendation:**
1. Immediately revoke the exposed OpenRouter API key and generate a new one.
2. Add `.env` and `.env.*` to `.gitignore`.
3. Create a `.env.example` with placeholder values for documentation.
4. Verify the key was not already committed to any remote.

---

### Important

#### I1. Interface extensions (`containsAnyText`, `toolArgsMatchAny`) undocumented in spec

**Spec §4.1 `outputAssertions`:**
```typescript
outputAssertions: {
  containsText?: string[];
  requiredArgs?: string[];
  toolArgsMatch?: Record<string, unknown>;
};
```

**Implementation (`e2e/lib/runner.ts:35-41`):**
```typescript
outputAssertions: {
  containsText?: string[];
  containsAnyText?: string[];     // ← not in spec
  requiredArgs?: string[];
  toolArgsMatch?: Record<string, unknown>;
  toolArgsMatchAny?: Record<string, unknown>[];  // ← not in spec
};
```

**Problem:** The implementation adds two new assertion fields:
- `containsAnyText`: passes if output contains **any one** of the listed strings (OR logic)
- `toolArgsMatchAny`: passes if tool args match **any one** of the listed patterns

These are used extensively: 11 of 17 scenarios use `containsAnyText` instead of `containsText`, and 1 scenario uses `toolArgsMatchAny`. These fields are pragmatically useful for handling LLM non-determinism but represent undocumented deviations from the spec.

**Impact:** The spec and implementation are out of sync. Future implementors reading the spec will not know these fields exist, and future reviewers cannot validate implementation compliance.

**Recommendation:** Update spec §4.1 to include `containsAnyText` and `toolArgsMatchAny` with documentation explaining when to use each:
- `containsText`: ALL fragments must appear (AND logic) — use for deterministic outputs
- `containsAnyText`: AT LEAST ONE fragment must appear (OR logic) — use when LLM phrasing varies
- `toolArgsMatchAny`: AT LEAST ONE pattern must match — use when multiple valid argument shapes exist

---

#### I2. `openrouter` provider undocumented in spec

**Spec §2.2:**
> `E2E_LLM_PROVIDER` | 是 | LLM 提供商：`openai` 或 `anthropic`

**Implementation (`e2e/lib/model.ts:5, 56`):**
```typescript
export type E2ELlmProvider = "openai" | "anthropic" | "openrouter";
```

Plus additional env vars: `E2E_OPENROUTER_SITE_URL`, `E2E_OPENROUTER_APP_NAME`.

**Problem:** The implementation adds full OpenRouter support as a third provider — including custom base URL, HTTP-Referer, and X-Title headers. The `.env` file is configured to use OpenRouter with a free-tier model (`arcee-ai/trinity-large-preview:free`). None of this is documented in the spec.

**Impact:** Spec readers won't know OpenRouter is supported. The OpenRouter provider route through `createOpenAI` with a custom `baseURL` is a clever reuse of the OpenAI SDK, but the pattern and its required env vars need documentation.

**Recommendation:** Add OpenRouter to spec §2.2 and §2.3 as a third supported provider. Document the additional env vars and the implementation pattern (OpenAI SDK with custom baseURL).

---

#### I3. Test entry architecture differs from spec — single `it` vs `it.each`

**Spec §3.2 and §7.5:**
> `it.each(scenarios) → assert tool called + output valid`
> Soft Fail 模式：所有场景都执行完毕再汇总结果，不因单个失败中断

**Implementation (`e2e/agent-e2e.test.ts:14-50`):**
```typescript
runE2E("runs all scenarios against a live LLM", async () => {
  // ...
  for (const scenario of allScenarios) {
    const result = await runner.runScenario(scenario);
    reporter.record(result);
  }
  // ... then throw if any failures
});
```

**Problem:** The spec describes `it.each(scenarios)` which creates **individual Vitest test cases per scenario**. The implementation uses a single `it` block with a `for` loop over all scenarios. Consequences:

1. **Reporting granularity**: Vitest output shows "1 passed" or "1 failed" for the entire suite, not per-scenario results. Individual scenario results are only visible in the custom console report.
2. **Timeout semantics**: The 300s `testTimeout` applies to all 17 scenarios combined, not per-scenario. This is consistent with the spec's §7.4 analysis, but only by coincidence.
3. **CI integration**: CI systems that parse Vitest output will see a single test, making it harder to track which scenarios regressed across releases.

The implementation does correctly implement soft-fail (all scenarios run before reporting), but the structural choice limits observability.

**Recommendation:** Consider using `it.each` with per-scenario timeouts. Alternatively, if the single-`it` approach is preferred for performance (one setup/teardown), document this architectural decision in the spec and acknowledge the trade-off in CI reporting.

---

#### I4. Token usage lost on retry failures — underreports actual LLM cost

**Location:** `e2e/lib/runner.ts:459-468`

```typescript
if (!isRetryableFailure(failure.failureType) || attempt >= maxAttempts) {
  return {
    // ...
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    // ...
  };
}
```

**Problem:** When a scenario fails (either immediately for non-retryable failures or after exhausting retries), the token usage is reported as all zeros. For retried scenarios, this discards usage from all attempts including the ones that successfully completed `generateText` but failed assertions.

**Impact:** The report's "Total LLM tokens" field understates actual consumption. For cost tracking and budget planning (especially with paid LLM providers), this makes the report unreliable. In worst case (all 17 scenarios fail after 3 attempts each = 51 calls), the report would show 0 tokens despite significant actual usage.

**Recommendation:** Accumulate token usage across retry attempts:
```typescript
let accumulatedUsage: ScenarioUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
// In the try block after generateText:
const currentUsage = usageFromResult(result);
accumulatedUsage = {
  inputTokens: accumulatedUsage.inputTokens + currentUsage.inputTokens,
  outputTokens: accumulatedUsage.outputTokens + currentUsage.outputTokens,
  totalTokens: accumulatedUsage.totalTokens + currentUsage.totalTokens,
};
// In failure return:
return { ..., usage: accumulatedUsage, ... };
```

---

#### I5. All-or-nothing failure mode contradicts spec's ≥90% release gate

**Spec §8.3 Release Gate 标准:**
> - 通过率 ≥ 90%（允许 LLM 不确定性导致的偶发失败）

**Implementation (`e2e/agent-e2e.test.ts:36-46`):**
```typescript
const failures = reporter.results().filter((item) => item.status === "failed");
if (failures.length > 0) {
  throw new Error(`E2E failures:\n${details}`);
}
```

**Problem:** The test throws on **any** failure (`failures.length > 0`), making the pass criteria 100%. The spec explicitly allows up to 10% failure rate to account for LLM non-determinism. With 17 scenarios, the spec allows 1 failure; the implementation allows 0.

**Impact:** In production use, this will cause frequent false-negative CI results. LLM outputs are inherently non-deterministic — occasional assertion failures on phrasing or argument ordering are expected. The 100% threshold will reduce trust in the E2E suite and may lead to teams ignoring or disabling it.

**Recommendation:** Implement the spec's release gate criteria in the test:
```typescript
const summary = reporter.summary();
const passRate = summary.passed / (summary.total - summary.skipped);
const toolNotCalledFailures = failures.filter(f => f.failureType === "TOOL_NOT_CALLED");

// Spec §8.3: no TOOL_NOT_CALLED failures
expect(toolNotCalledFailures).toHaveLength(0);
// Spec §8.3: ≥90% pass rate
expect(passRate).toBeGreaterThanOrEqual(0.9);
```

---

### Minor

#### M1. `.env` has leading whitespace on all variable lines

**Location:** `.env:2-16`

```
  E2E_LLM_PROVIDER=openrouter
  E2E_LLM_API_KEY=sk-or-v1-...
```

**Problem:** Every variable line starts with 2 spaces. While most dotenv parsers trim leading whitespace from keys, some environments or CI systems may not. This could cause `hasRequiredLlmConfig()` to return false despite the `.env` file being present.

**Recommendation:** Remove leading whitespace from all variable lines in `.env` (and the future `.env.example`).

---

#### M2. No `.env.example` file

**Problem:** The project lacks a `.env.example` documenting required and optional E2E environment variables with placeholder values. This is especially important given that the actual `.env` should be excluded from version control (per C1).

**Recommendation:** Create `.env.example`:
```
# Required for live LLM E2E
E2E_LLM_PROVIDER=openai
E2E_LLM_API_KEY=your-api-key-here
E2E_LLM_MODEL=gpt-4o

# Optional tuning
E2E_TIMEOUT_MS=30000
E2E_MAX_RETRIES=2

# OpenRouter-specific (when E2E_LLM_PROVIDER=openrouter)
# E2E_OPENROUTER_SITE_URL=https://your-site.example
# E2E_OPENROUTER_APP_NAME=mantle-mcp-e2e

# Optional: enables indexer scenarios (otherwise they are skipped)
# E2E_SUBGRAPH_ENDPOINT=https://your-subgraph-endpoint
# E2E_SQL_ENDPOINT=https://your-sql-endpoint
```

---

#### M3. `expectedOutcome` field present but unused in assertion logic

**Location:** `e2e/lib/runner.ts:185-258` (`assertScenario` function)

**Problem:** The `expectedOutcome` field (`"success" | "tool-error"`) is defined in `AgentScenario` and set in every scenario, but `assertScenario` never references it. The differentiation is handled implicitly through the `containsText`/`containsAnyText` values (error strings for `tool-error`, success strings for `success`).

**Impact:** `expectedOutcome` is dead code in the runner. It serves only as documentation in the scenario definitions. If a scenario is misconfigured (e.g., `tool-error` with success assertions), the runner won't catch the inconsistency.

**Recommendation:** Consider adding a validation check that uses `expectedOutcome`:
- For `tool-error` scenarios, verify the tool adapter returned `is_error: true` in the result.
- For `success` scenarios, verify no tool error was returned.
This would catch misconfigured scenarios and add a meaningful assertion layer.

---

#### M4. Spec references `maxSteps: 3` but implementation uses `stopWhen: stepCountIs(3)`

**Spec §5.2 pseudocode:**
```typescript
const result = await generateText({
  // ...
  maxSteps: 3,
});
```

**Implementation (`e2e/lib/runner.ts:434-442`):**
```typescript
const result = await generateText({
  // ...
  stopWhen: stepCountIs(3),
  maxRetries: 0,
  timeout: resolvedScenario.timeoutMs ?? this.config.timeoutMs
});
```

**Problem:** In Vercel AI SDK v6 (`ai: ^6.0.105`), the `maxSteps` parameter was replaced by `stopWhen: stepCountIs(n)`. The implementation correctly uses the v6 API, but the spec still references the v4/v5 `maxSteps` API.

The implementation also adds `maxRetries: 0` (disabling SDK-level retries since the runner handles retries) and `timeout` (per-call timeout), neither of which appear in the spec pseudocode.

**Impact:** Spec pseudocode is stale relative to the actual SDK version used. Future readers may be confused by the discrepancy.

**Recommendation:** Update spec §5.2 pseudocode to use `stopWhen: stepCountIs(3)`, `maxRetries: 0`, and `timeout`. Note the SDK version dependency.

---

#### M5. SERVER_INSTRUCTIONS.md loaded via CWD-relative path

**Location:** `e2e/lib/runner.ts:369`

```typescript
this.systemPrompt = readFileSync(path.resolve(process.cwd(), "SERVER_INSTRUCTIONS.md"), "utf8");
```

**Problem:** The system prompt is loaded from `SERVER_INSTRUCTIONS.md` relative to `process.cwd()`. This works when tests are run from the project root (the normal case), but will fail if CWD is different. Vitest typically sets CWD to the config file's directory, but this is fragile.

**Recommendation:** Use `import.meta.url` to resolve relative to the runner file:
```typescript
const root = path.resolve(new URL(".", import.meta.url).pathname, "../..");
this.systemPrompt = readFileSync(path.resolve(root, "SERVER_INSTRUCTIONS.md"), "utf8");
```

---

#### M6. `readonly model` field uses type assertion hack

**Location:** `e2e/lib/runner.ts:359`

```typescript
private readonly model = undefined as ReturnType<typeof resolveE2EModel> | undefined;
```

**Problem:** The `model` field is declared `readonly` with an initial value of `undefined as ...`, then reassigned in the constructor. While this compiles (TypeScript allows readonly assignment in constructors), the `= undefined as ReturnType<...>` pattern is a type assertion that works around the type system rather than using it properly.

**Recommendation:** Use a definite assignment assertion or make it non-readonly:
```typescript
// Option A: definite assignment
private readonly model!: LanguageModel;

// Option B: initialized in constructor (already the case, just fix the declaration)
private readonly model: LanguageModel;
constructor() {
  this.model = resolveE2EModel(this.config);
}
```

---

### Informational

#### N1. TypeScript and test health verified

- `tsc --noEmit`: Clean, zero errors
- `vitest run` (unit tests): 12 files, 44 tests, all pass
- `vitest run --config vitest.e2e.config.ts` (dry): 1 pass (scenario count), 1 skip (no LLM env)
- No regressions introduced to existing test suite

#### N2. OpenRouter support is a pragmatic addition

The `openrouter` provider allows cost optimization through free-tier models (e.g., `arcee-ai/trinity-large-preview:free` in the `.env`). This is valuable for development iteration where OpenAI/Anthropic API costs would accumulate. The implementation cleanly reuses the OpenAI SDK with a custom `baseURL`, which is the recommended OpenRouter integration pattern.

#### N3. `containsAnyText` is a valuable assertion relaxation

The OR-logic assertion (`containsAnyText`) handles a real problem: LLM outputs vary in phrasing across runs. A tool returning `POOL_NOT_FOUND` might be relayed by the agent as "pool not found", "POOL_NOT_FOUND", or "error: the pool was not found". The `containsAnyText: ["pool_not_found", "not found", "error"]` pattern correctly handles this variance.

#### N4. Tool adapter correctly normalizes MCP error responses

The `normalizeMcpResult` function in `tool-adapter.ts` correctly unwraps MCP content arrays, parses JSON text parts, and propagates `isError` flags. This ensures the LLM sees structured tool results (including errors) and can relay them in natural language, which is essential for the `tool-error` scenario category.

#### N5. `deepPartialMatch` is well-implemented

The partial match function in `runner.ts` correctly handles nested objects, arrays (with positional matching), and primitive equality. This supports complex `toolArgsMatch` patterns like `{ tokens: ["USDC", "WMNT"] }` which require deep array comparison.

---

## 4. Findings Summary

| Severity | ID | Summary |
|----------|-----|---------|
| Critical | C1 | `.env` contains real API key; `.gitignore` doesn't exclude `.env` |
| Important | I1 | `containsAnyText` and `toolArgsMatchAny` interface extensions undocumented in spec |
| Important | I2 | `openrouter` provider undocumented in spec |
| Important | I3 | Single `it` + loop vs spec's `it.each` — changes failure reporting granularity |
| Important | I4 | Token usage zeroed on retry failures — underreports actual LLM cost |
| Important | I5 | Hard-fail on any failure contradicts spec's ≥90% release gate threshold |
| Minor | M1 | `.env` has leading whitespace on all variable lines |
| Minor | M2 | No `.env.example` file for documentation |
| Minor | M3 | `expectedOutcome` field defined but unused in assertion logic |
| Minor | M4 | Spec references `maxSteps: 3`, implementation uses `stopWhen: stepCountIs(3)` |
| Minor | M5 | SERVER_INSTRUCTIONS.md loaded via CWD-relative path |
| Minor | M6 | `readonly model` field uses type assertion hack |
| Info | N1 | TypeScript and test health verified — all green |
| Info | N2 | OpenRouter support is a pragmatic cost optimization |
| Info | N3 | `containsAnyText` handles real LLM phrasing variance |
| Info | N4 | Tool adapter correctly normalizes MCP error responses |
| Info | N5 | `deepPartialMatch` is well-implemented for nested assertions |

---

## 5. Spec Deviation Analysis

| Area | Spec | Implementation | Assessment |
|------|------|----------------|------------|
| Scenario count | 17 tools, 17 scenarios | 17 scenarios registered | ✅ Compliant |
| Directory structure | `e2e/scenarios/`, `e2e/lib/`, `e2e/agent-e2e.test.ts` | Exact match | ✅ Compliant |
| `AgentScenario` interface | `containsText`, `requiredArgs`, `toolArgsMatch` | Adds `containsAnyText`, `toolArgsMatchAny` | ⚠️ Superset — I1 |
| Provider support | `openai`, `anthropic` | Adds `openrouter` | ⚠️ Superset — I2 |
| Test pattern | `it.each(scenarios)` | Single `it` + `for` loop | ⚠️ Deviation — I3 |
| Failure threshold | ≥90% pass rate | 100% (fail on any) | ❌ Deviation — I5 |
| `generateText` API | `maxSteps: 3` | `stopWhen: stepCountIs(3)` | ⚠️ SDK evolution — M4 |
| System prompt | `SERVER_INSTRUCTIONS_CONTENT` | `readFileSync("SERVER_INSTRUCTIONS.md")` | ✅ Equivalent |
| Setup/teardown | `beforeAll`/`afterAll` hooks | `E2EAgentRunner.setup()`/`teardown()` | ✅ Equivalent (class-based) |
| InMemoryTransport | `createLinkedPair()` | `InMemoryTransport.createLinkedPair()` | ✅ Compliant |
| Tool adapter | `convertToAiSdkTools(mcpTools, client)` | Same signature and behavior | ✅ Compliant |
| Retry logic | `1 + E2E_MAX_RETRIES` attempts, retryable types | Exact match | ✅ Compliant |
| Failure types | 5 types (TOOL_NOT_CALLED, WRONG_ARGS, etc.) | All 5 implemented | ✅ Compliant |
| Layered assertions | L1→L2→L3a→L3b | All 4 layers in correct order | ✅ Compliant |
| `skipUnless` | Env var check, skip if absent | Correctly implemented | ✅ Compliant |
| Template resolution | `{E2E_SUBGRAPH_ENDPOINT}` → env value | Regex-based, handles nested values | ✅ Compliant |
| `vitest.e2e.config.ts` | `testTimeout: 300_000`, `retry: 0` | Exact match | ✅ Compliant |
| Scenario categories | self-contained, network, stub-deps, endpoint-configured | All categories correctly applied | ✅ Compliant |
| Report format | §7.6 structured report | All fields present | ⚠️ Token usage incomplete — I4 |

---

## 6. Scenario Compliance

| ID | Spec Prompt | Impl Prompt | Args Match | Assertions | Status |
|----|-------------|-------------|------------|------------|--------|
| `chain-getChainInfo-mainnet` | ✅ Match | ✅ | ✅ `network: "mainnet"` | ✅ `["5000", "MNT"]` | ✅ |
| `chain-getChainStatus-mainnet` | ✅ Match | ✅ | ✅ `network: "mainnet"` | ✅ `["block"]` | ✅ |
| `registry-resolveAddress-usdc` | ✅ Match | ✅ | ✅ `identifier: "USDC"` | ✅ `["0x09Bc4E..."]` | ✅ |
| `registry-validateAddress-wmnt` | ✅ Match | ✅ | ✅ `address: "0x78c1b..."` | ⚠️ Uses `containsAnyText` | ✅ |
| `account-getBalance-sample` | ✅ Match | ✅ | ✅ `address: "0x458F..."` | ⚠️ Uses `containsAnyText` | ✅ |
| `account-getTokenBalances-multi` | ✅ Match | ✅ | ✅ `address: "0x458F..."` | ✅ `["balance"]` | ✅ |
| `account-getAllowances-agni` | ✅ Match | ✅ | ✅ `owner: "0x458F..."` | ✅ `["allowance"]` | ✅ |
| `token-getTokenInfo-usdc` | ✅ Match | ✅ | ✅ `token: "USDC"` | ⚠️ Uses `containsAnyText` | ✅ |
| `token-resolveToken-meth` | ✅ Match | ✅ | ✅ `symbol: "mETH"` | ✅ `["meth"]` | ✅ |
| `token-getTokenPrices-multi` | ✅ Match | ✅ | ✅ `tokens: [...]` | ⚠️ Uses `containsAnyText` | ✅ |
| `defi-getSwapQuote-agni` | ✅ Match | ✅ | ✅ tool-error | ⚠️ Uses `containsAnyText` | ✅ |
| `defi-getPoolLiquidity-pool` | ✅ Match | ✅ | ✅ tool-error | ⚠️ Uses `containsAnyText` | ✅ |
| `defi-getLendingMarkets-aave` | ✅ Match | ✅ | ⚠️ Uses `toolArgsMatchAny` | ⚠️ Uses `containsAnyText` | ✅ |
| `indexer-querySubgraph-basic` | ✅ Match | ✅ | ✅ endpoint template | ⚠️ Uses `containsAnyText` | ✅ |
| `indexer-queryIndexerSql-basic` | ✅ Match | ✅ | ✅ endpoint template | ⚠️ Uses `containsAnyText` | ✅ |
| `diagnostics-checkRpcHealth-mainnet` | ✅ Match | ✅ | ✅ `network: "mainnet"` | ⚠️ Uses `containsAnyText` | ✅ |
| `diagnostics-probeEndpoint-block` | ✅ Match | ✅ | ✅ `rpc_url`, `method` | ⚠️ Uses `containsAnyText` | ✅ |

All 17 scenarios are present and structurally correct. The ⚠️ markers indicate use of `containsAnyText`/`toolArgsMatchAny` (see I1) rather than the spec's `containsText`/`toolArgsMatch`, which is a pragmatic improvement but undocumented.

---

## 7. Architecture & Code Quality

| Criterion | Assessment |
|-----------|------------|
| Separation of concerns | ✅ Clean split: model resolution, tool adaptation, runner logic, scenarios, test entry |
| DI/testability in runner | ✅ `E2EAgentRunner` accepts `env` parameter; `hasRequiredLlmConfig` accepts env |
| Error handling | ✅ `ScenarioFailure` class with typed `failureType`; `classifyUnexpectedError` for SDK errors |
| Retry logic | ✅ Correctly distinguishes retryable vs non-retryable; immediate retry without delay |
| Template resolution | ✅ Regex-based, handles nested values in toolArgsMatch |
| Type safety | ✅ Full TypeScript, strict mode, explicit interfaces |
| MCP lifecycle | ✅ `InMemoryTransport.createLinkedPair()`, proper `connect`/`close` in setup/teardown |
| Reporter | ✅ Clean console output matching spec §7.6 format |
| Code duplication | ✅ Minimal — `isRecord` is duplicated between `runner.ts` and `tool-adapter.ts` (acceptable) |

---

## 8. Safety & Security

| Criterion | Assessment |
|-----------|------------|
| Credential management | ❌ Real API key in `.env`, not gitignored — C1 |
| No secrets in code | ✅ No hardcoded keys in `.ts` files |
| Read-only operations | ✅ E2E tests only invoke MCP tools, no state mutation |
| Network isolation | ✅ MCP uses InMemoryTransport; only LLM calls go to network |
| Timeout protection | ✅ Per-call timeout via `E2E_TIMEOUT_MS`; Vitest `testTimeout` as outer bound |
| CI safety | ✅ Live test auto-skipped when LLM env vars absent |

---

## 9. Recommendations

### Must-fix (Critical)

| ID | Fix | Effort |
|----|-----|--------|
| C1 | Revoke exposed API key, add `.env` to `.gitignore`, create `.env.example` | Trivial |

### Should-fix (Important)

| ID | Fix | Effort |
|----|-----|--------|
| I1 | Update spec §4.1 to document `containsAnyText` and `toolArgsMatchAny` | Low |
| I2 | Update spec §2.2/§2.3 to document `openrouter` provider | Low |
| I3 | Either adopt `it.each` or document the single-`it` decision in spec | Low |
| I4 | Accumulate token usage across retry attempts in `runScenario` | Low |
| I5 | Implement ≥90% pass rate gate instead of 100% | Low |

### Nice-to-fix (Minor)

| ID | Fix | Effort |
|----|-----|--------|
| M1 | Remove leading whitespace in `.env` | Trivial |
| M2 | Create `.env.example` (combined with C1) | Trivial |
| M3 | Use `expectedOutcome` in assertion logic or remove from interface | Low |
| M4 | Update spec pseudocode to use `stopWhen: stepCountIs(3)` | Trivial |
| M5 | Use `import.meta.url` for SERVER_INSTRUCTIONS.md resolution | Low |
| M6 | Fix `readonly model` declaration pattern | Trivial |

### Test additions (post-fix)

| Area | Suggested Test |
|------|----------------|
| Token reporting | Verify `usage` is non-zero after retried failures |
| Release gate | Verify ≥90% threshold logic with mock results |
| `containsAnyText` | Unit test for OR-logic assertion path |

---

## 10. Verdict

| Criterion | Status |
|-----------|--------|
| Spec structural compliance | ✅ All files, scenarios, and interfaces present |
| Spec behavioral compliance | ⚠️ Release gate threshold mismatch (I5), interface extensions (I1–I2) |
| TypeScript health | ✅ Clean compile, no errors |
| Unit test regression | ✅ 44/44 pass, no regression |
| E2E dry run | ✅ Scenario count correct, LLM test correctly skipped |
| Security | ❌ Credential leak risk (C1) |
| Critical issues | **1** (C1) |
| Important issues | **5** (I1–I5) |
| Minor issues | **6** (M1–M6) |
| Informational notes | **5** (N1–N5) |
| Ready for release-gate use | ❌ Not until C1 is resolved and I5 is addressed |
| Blockers | C1 (credential leak), I5 (incorrect failure threshold) |

**Overall:** The E2E Agent Testing implementation is architecturally sound and demonstrates strong engineering practices — clean separation of concerns, typed error handling, layered assertions, and flexible template resolution. The scenario catalog faithfully covers all 17 v0.2 tools with appropriate categories. The critical blocker is the exposed API key in `.env` (C1), which must be resolved immediately. The important items (I1–I5) are primarily spec-implementation synchronization issues and a failure threshold mismatch, all of which are low-effort fixes. Once these are addressed, the E2E suite will be a valuable release gate as designed.
