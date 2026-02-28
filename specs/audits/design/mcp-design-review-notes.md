# MCP Design Review Notes

Reviewed on: 2026-02-28
Reviewer: Codex
Target: `specs/mcp-design.md`

## Scope

- Consistency across tool schemas, prompts, and mapping tables
- Safety model alignment (fail-closed, unsigned-only, verification requirements)
- Phase 4 completeness (Aave V3 and lending path integration)
- Operational implementability (config, data sources, CI sync)

## Findings (ordered by severity)

### Critical

1. [C-01] `Fail closed` principle is contradicted by token-list fallback behavior.
- Location:
  - `specs/mcp-design.md:41` (`T3. Fail closed`)
  - `specs/mcp-design.md:499-500` (token-list mismatch vs unavailable behavior)
- Problem:
  - Spec says tools must fail closed when result is untrustworthy.
  - But token-list unavailable path allows downgraded confidence instead of hard failure.
- Risk:
  - Execution flows may proceed with unverified token mapping under degraded conditions.
- Recommendation:
  - For execution-related calls, enforce hard error when token-list cannot be checked.
  - Keep degraded mode only for read-only workflows with explicit opt-out flag.
- Suggested contract change:
  - Add `TOKEN_LIST_UNAVAILABLE` error.
  - Enforce `require_token_list_match=true` by default in all tx-building paths.

2. [C-02] `environment`/`network` enum schema is inconsistent (`testnet` vs `sepolia`).
- Location:
  - `specs/mcp-design.md:879-885` (`mantle_resolveAddress` uses `environment: mainnet|testnet`)
  - `specs/mcp-design.md:911+` (most tools use `network: mainnet|sepolia`)
  - `specs/mcp-design.md:2273` (Prompt args still mention `mainnet or testnet`)
- Problem:
  - Input contracts and prompts are not aligned, increasing integration and runtime mapping errors.
- Risk:
  - Wrong chain selection, parser edge-cases, agent prompt/tool mismatch.
- Recommendation:
  - Standardize on `network: "mainnet" | "sepolia"` across all tools/prompts.
  - Optionally keep `testnet` as deprecated alias mapped to `sepolia` with warning.

### High

3. [H-01] Tool count summary is stale after adding `mantle_buildLendingTx`.
- Location:
  - `specs/mcp-design.md:1814-1817` (Tx Building still `5`, total still `29`)
  - `specs/mcp-design.md:3289-3314` (Appendix correctly lists `30` tools)
- Problem:
  - Two summary sections disagree.
- Risk:
  - Confusion during implementation planning, test coverage planning, and audits.
- Recommendation:
  - Update section 5 tool summary to Transaction Building `6`, Total `30`.

4. [H-02] Aave V3 is declared supported, but core addresses are placeholders.
- Location:
  - `specs/mcp-design.md:522-524` (`src/config/protocols.ts` example)
  - `specs/mcp-design.md:1950-1952` (`mantle://registry/protocols` example)
- Problem:
  - Spec now includes `aave_v3`, but key contracts remain `"..."` placeholders.
- Risk:
  - Implementation ambiguity; accidental deployment with wrong addresses.
- Recommendation:
  - Mark as explicit blocker until concrete addresses are filled.
  - Add canonical source references and update policy for rotating addresses per network.

5. [H-03] Quick-reference + token-list double-check lacks canonicalization policy for native/special symbols.
- Location:
  - `specs/mcp-design.md:154-161` (Quick Reference token table)
  - `specs/mcp-design.md:496-500` (double-check policy)
- Problem:
  - Strict equality check is underspecified for native token representations and wrapper variants.
- Risk:
  - False mismatch errors (or brittle workaround logic) in production.
- Recommendation:
  - Define normalization matrix per symbol class:
    - native token representation
    - wrapped token aliases
    - chain-specific pseudo-address conventions
  - Require explicit allowlist for exceptions with audit trail.

### Medium

6. [M-01] Determinism tenet and remote token-list dependency are not reconciled enough.
- Location:
  - `specs/mcp-design.md:37` (pure-function tenet)
  - `specs/mcp-design.md:497` (runtime remote token-list fetch)
  - `specs/mcp-design.md:3135-3136` (URL + TTL config)
- Problem:
  - Runtime remote source + cache TTL can produce different results for identical inputs across short intervals.
- Recommendation:
  - Include token-list version hash/ETag in `mantle_resolveToken` output.
  - Define cache invalidation and reproducibility mode (pin snapshot).

7. [M-02] CI synchronization currently covers contracts, not token/protocol/ABI integrity against canonical sources.
- Location:
  - `specs/mcp-design.md:528` (CI sync statement focuses on registry parity)
  - `specs/mcp-design.md:3270-3277` (section 11.5 only contract registry sync)
- Problem:
  - Token/protocol drift risks remain, especially after adding token-list double-check and Aave support.
- Recommendation:
  - Extend CI checks to:
    - quick-reference token map vs canonical token-list snapshot policy
    - protocol registry completeness for enabled features (Aave V3)
    - ABI registry presence for all declared tx builders/readers.

8. [M-03] Companion MCP prompt still undersells new lending support.
- Location:
  - `specs/mcp-design.md:2760` (mentions Agni/Merchant Moe/Lendle only)
- Problem:
  - Phase 4 now includes Aave V3 lending tx path, but this summary line omits it.
- Recommendation:
  - Update to include Aave V3 in capability bullet to avoid stale operator guidance.

9. [M-04] Lending risk preflight check is conceptually present but threshold policy is undefined.
- Location:
  - `specs/mcp-design.md:2705-2710` (health-factor check)
- Problem:
  - No explicit threshold or fallback behavior, unlike slippage/impact checks.
- Recommendation:
  - Add concrete default thresholds and configurable overrides (warn/block), plus no-data behavior.

## Suggested Next Patch Set (minimal)

1. Standardize all tool and prompt schemas to `network: mainnet|sepolia`.
2. Enforce strict fail-closed behavior for token-list unavailable in execution paths.
3. Fix tool-count summary (5.9/overall count) to match appendix.
4. Add Aave V3 concrete address placeholders policy (`BLOCKER` tag + source links) or fill real values.
5. Add token canonicalization rules and CI checks for token/protocol/ABI consistency.
6. Add lending health-factor threshold defaults and update companion text to include Aave V3.

## Notes for Opus 4.6 Review

- Please specifically challenge [C-01] and [C-02] first; they are the highest risk for incorrect execution behavior.
- If you disagree with strict fail-closed on token-list outage, propose a formal risk-tier policy (read-only vs execution) and exact schema/flag changes.
