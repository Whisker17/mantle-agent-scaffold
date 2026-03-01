# Mantle MCP E2E Agent Testing — Re-Review

**Re-Review Date:** 2026-03-01
**Source Audit:** `specs/audits/e2e/e2e-agent-testing-audit.md`
**Audit Response:** `specs/audits/e2e/e2e-agent-testing-audit-response.md`
**Reviewer:** Claude Opus 4.6 (original auditor)

---

## 1. Verification Evidence

All commands executed by the reviewer:

| Command | Result |
|---------|--------|
| `tsc --noEmit` | Clean — 0 errors |
| `vitest run` | 14 files, **55/55 tests pass** (was 44 pre-fix; +11 new tests) |
| `vitest run --config vitest.e2e.config.ts` | 1 pass, 1 skipped (correct: no LLM env configured) |

---

## 2. Finding-by-Finding Re-Review

### C1. `.env` leaked real API key; `.gitignore` missed dotenv — RESOLVED

| Check | Result |
|-------|--------|
| `.gitignore` includes `.env`, `.env.*` | ✅ Lines 2-3: `.env` and `.env.*` |
| `.gitignore` preserves `.env.example` | ✅ Line 4: `!.env.example` |
| `.env` API key replaced with placeholder | ✅ Line 3: `placeholder-openrouter-api-key` |
| `.env` leading whitespace removed | ✅ All lines left-aligned (also closes M1) |
| `.env.example` created with documentation | ✅ 18 lines, covers all required/optional vars |

**Remaining action (external):** Original leaked key `sk-or-v1-68f77...` must be revoked in OpenRouter account settings. This is an operational task outside the repo, correctly noted in the response.

---

### I1. `containsAnyText` / `toolArgsMatchAny` undocumented in spec — RESOLVED

| Check | Result |
|-------|--------|
| Spec §4.1 includes `containsAnyText` | ✅ Line 279: `containsAnyText?: string[]` with OR semantics comment |
| Spec §4.1 includes `toolArgsMatchAny` | ✅ Line 291: `toolArgsMatchAny?: Record<string, unknown>[]` with OR semantics comment |
| Spec §5.3 assertion table documents AND/OR | ✅ L3a and L3b rows updated with explicit AND/OR explanations |
| Spec notes co-existence behavior | ✅ Line 445: "containsText 与 containsAnyText 可同时配置" |

---

### I2. `openrouter` provider undocumented in spec — RESOLVED

| Check | Result |
|-------|--------|
| Spec §2.2 env table lists `openrouter` | ✅ Line 77: `openai`、`anthropic` 或 `openrouter` |
| Spec §2.2 lists OpenRouter-specific env vars | ✅ Lines 80-81: `E2E_OPENROUTER_SITE_URL`, `E2E_OPENROUTER_APP_NAME` |
| Spec §2.3 includes OpenRouter code path | ✅ Lines 108-120: `createOpenAI` with `baseURL` pattern |
| Spec §2.3 explains the pattern | ✅ Lines 125-126: note on `createOpenAI` reuse |

---

### I3. Single `it` vs spec's `it.each` — RESOLVED

The spec has been updated throughout to document the single-main-test-block architecture:

| Check | Result |
|-------|--------|
| Spec §3.1 diagram updated | ✅ Line 171: "单个主测试块顺序执行 scenarios（soft-fail 汇总后统一失败）" |
| Spec §3.2 flow updated | ✅ Line 187: "Main test block（单个 it... 内顺序循环）" |
| Spec §4.2 file description updated | ✅ Line 322: "主测试入口（单个 it 顺序执行所有场景并汇总）" |
| Spec §5.1 setup/teardown updated | ✅ Line 356: "主测试块按 setupRunner() → for...of 顺序执行一次" |
| Spec §7.4 timeout notes updated | ✅ Lines 613-615: notes on testTimeout applying to whole block |
| Spec §7.5 CI reporting tradeoff documented | ✅ Line 620: "CI 报告权衡" note |

---

### I4. Token usage lost on retry failures — RESOLVED

| Check | Result |
|-------|--------|
| `emptyUsage()` helper added | ✅ `runner.ts:292-298` |
| `addUsage()` accumulator added | ✅ `runner.ts:300-306` |
| Usage accumulated per attempt | ✅ `runner.ts:599-600`: `accumulatedUsage = addUsage(accumulatedUsage, attemptUsage)` |
| Failure path uses accumulated | ✅ `runner.ts:622` and `runner.ts:635` |
| Regression test: accumulated across retries | ✅ `runner-usage.test.ts` "accumulates usage from each failed retry attempt" — asserts `{24, 16, 40}` from 2 attempts |
| Regression test: non-retryable retains usage | ✅ `runner-usage.test.ts` "retains usage on immediate non-retryable failures" — asserts `{5, 3, 8}` |

---

### I5. All-or-nothing failure mode contradicts ≥90% release gate — RESOLVED

| Check | Result |
|-------|--------|
| `evaluateReleaseGate()` exported | ✅ `runner.ts:119-144` |
| Default `minPassRate = 0.9` | ✅ `runner.ts:121` |
| Skipped scenarios excluded from pass rate | ✅ `runner.ts:127`: `executed = passedScenarios + failures.length` |
| Hard failure types: TOOL_NOT_CALLED, TIMEOUT, LLM_ERROR | ✅ `runner.ts:85-89` |
| `passed = meetsPassRate && hardFailures.length === 0` | ✅ `runner.ts:142` |
| Test entry uses `evaluateReleaseGate` | ✅ `agent-e2e.test.ts:41` |
| Error message includes pass rate + hard failure details | ✅ `agent-e2e.test.ts:56-65` |
| Unit test: passes at 90% | ✅ `release-gate.test.ts:50-64` |
| Unit test: fails below 90% | ✅ `release-gate.test.ts:66-80` |
| Unit test: TOOL_NOT_CALLED blocks at 90% | ✅ `release-gate.test.ts:82-95` |
| Unit test: TIMEOUT blocks at 90% | ✅ `release-gate.test.ts:97-110` |
| Unit test: LLM_ERROR blocks at 90% | ✅ `release-gate.test.ts:112-125` |

Implementation aligns with spec §8.3 release gate criteria.

---

### M1. `.env` leading whitespace — RESOLVED

Fixed as part of C1. All lines in `.env` are now left-aligned.

---

### M2. Missing `.env.example` — RESOLVED

`.env.example` created with 18 lines covering all E2E variables. Includes commented-out model alternatives for OpenAI and Anthropic.

---

### M3. `expectedOutcome` unused — RESOLVED

| Check | Result |
|-------|--------|
| `extractErrorFlag()` added | ✅ `runner.ts:208-222`: checks `is_error`/`isError` on result objects |
| `resolveToolResultErrorFlag()` added | ✅ `runner.ts:224-230`: checks both top-level and nested `output` |
| `ToolCallRecord` includes `resultIsError` | ✅ `runner.ts:54` |
| `extractToolCalls` extracts error flags | ✅ `runner.ts:244-278`: matches toolResults by toolCallId or toolName |
| `assertScenario` validates `expectedOutcome` | ✅ `runner.ts:397-411`: bidirectional check (expected error but got success, and vice versa) |
| Test: tool-error expected, got success | ✅ `runner-usage.test.ts:144-169` |
| Test: success expected, got error | ✅ `runner-usage.test.ts:171-196` |
| Test: tool-error expected, got error (pass) | ✅ `runner-usage.test.ts:198-222` |

---

### M4. Spec pseudocode used old `maxSteps` API — RESOLVED

| Check | Result |
|-------|--------|
| Spec §2.1 note on v6 API | ✅ Line 71: "AI SDK v6 语义：多步循环使用 `stopWhen: stepCountIs(3)`" |
| Spec §3.1 diagram uses new API | ✅ Line 159: `stopWhen: stepCountIs(3)` |
| Spec §3.2 flow uses new API | ✅ Lines 194-196: `stopWhen`, `maxRetries: 0`, `timeout` |
| Spec §5.2 pseudocode updated | ✅ Lines 409-411: `stopWhen: stepCountIs(3)`, `maxRetries: 0`, `timeout` |

---

### M5. SERVER_INSTRUCTIONS.md path depended on CWD — RESOLVED

| Check | Result |
|-------|--------|
| `fileURLToPath` import added | ✅ `runner.ts:3` |
| Module-relative path constant | ✅ `runner.ts:19-22`: `path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../SERVER_INSTRUCTIONS.md")` |
| Constructor uses constant | ✅ `runner.ts:523` |
| Regression test verifies non-root CWD | ✅ `runner-usage.test.ts:58-77`: changes CWD to temp dir, verifies no throw |

---

### M6. `readonly model` type assertion hack — RESOLVED

| Check | Result |
|-------|--------|
| Old: `private readonly model = undefined as ReturnType<...> \| undefined` | Removed |
| New: `private readonly model: ReturnType<typeof resolveE2EModel>` | ✅ `runner.ts:513` — clean typed declaration |
| Constructor assignment | ✅ `runner.ts:522`: `this.model = resolveE2EModel(this.config)` |

---

## 3. New Code Quality Assessment

The fixes introduce 3 new concepts worth noting:

**`evaluateReleaseGate` (runner.ts:85-144)**
Clean, well-typed function with a single responsibility. Correctly separates "hard" failure types from "soft" ones using an immutable `Set`. The `ReleaseGateEvaluation` interface provides comprehensive diagnostics for error reporting. The edge case of zero executed scenarios defaults to `passRate = 1` (correct — nothing failed).

**`expectedOutcome` enforcement (runner.ts:208-411)**
The `extractToolCalls` function now correlates tool calls with tool results using `toolCallId` first (exact match) then `toolName` (name-based fallback), with a `consumedResultIndexes` set to prevent double-matching. This is robust against reordered or missing results. The `resolveToolResultErrorFlag` function handles both `is_error` and `isError` property names and checks both the result object and its `output` property — covering the AI SDK's various result formats.

**Usage accumulation (runner.ts:292-306, 585-635)**
Simple and correct. `emptyUsage()` + `addUsage()` are pure helper functions. The accumulation variable is initialized before the retry loop and updated inside the try block (after `generateText` succeeds but potentially before assertions pass). This means usage is captured even when assertions fail, which is the correct behavior.

---

## 4. Observations (Non-Blocking)

These are NOT open findings — just notes for future reference:

1. **Spec §2.1 version numbers**: The devDependencies example still shows `ai: "^4.x"`, while the actual `package.json` has `ai: "^6.0.105"`. The inline note referencing "AI SDK v6 语义" partially addresses this, but the version numbers in the example block are stale. Consider updating in the next spec revision.

2. **Spec §8.3 criteria 4 and 5** ("新增工具 PASS" and "无连续失败场景") are cross-release concerns that cannot be enforced in a single test run. The current `evaluateReleaseGate` correctly focuses on single-run criteria. Cross-release tracking would require external tooling (e.g., a historical result store) and is appropriately deferred.

3. **Test count growth**: Unit tests went from 44 to 55 (+11 tests in 2 new files). The new tests are well-structured, use mocking appropriately, and cover edge cases thoroughly.

---

## 5. Verdict

| Finding | Original Severity | Resolution |
|---------|------------------|------------|
| C1 | Critical | ✅ Resolved (external key rotation pending) |
| I1 | Important | ✅ Resolved |
| I2 | Important | ✅ Resolved |
| I3 | Important | ✅ Resolved |
| I4 | Important | ✅ Resolved |
| I5 | Important | ✅ Resolved |
| M1 | Minor | ✅ Resolved |
| M2 | Minor | ✅ Resolved |
| M3 | Minor | ✅ Resolved |
| M4 | Minor | ✅ Resolved |
| M5 | Minor | ✅ Resolved |
| M6 | Minor | ✅ Resolved |

**All 12 findings verified as resolved.** TypeScript compiles clean, 55/55 unit tests pass, E2E dry run passes. The spec and implementation are now in agreement.

**Consensus reached.** The E2E Agent Testing implementation is approved for release-gate use, pending the external operational action of revoking the previously exposed OpenRouter API key.
