---
name: mantle-defi-operator
description: Use when preparing Mantle DeFi swaps or liquidity actions with read-only analysis, quote/liquidity checks, allowance review, and an external execution handoff plan.
---

# Mantle Defi Operator

## Overview

Turn DeFi intent into deterministic pre-execution steps on Mantle. Validate quote/liquidity and allowance prerequisites, then produce an execution handoff plan for an external signer or wallet.

## Workflow

1. Normalize intent:
   - `swap`, `add_liquidity`, `remove_liquidity`, or compound flow
   - token addresses, amounts, recipient, deadline, slippage
2. Run prep checks from `references/defi-execution-guardrails.md`.
3. Load operation SOP:
   - swap: `references/swap-sop.md`
   - liquidity: `references/liquidity-sop.md`
4. Resolve quote and route.
5. Check allowance; if insufficient, prepare `approve` step.
6. If account supports batching (for example ERC-4337 smart account), note whether approve+action can be safely batched by the external executor.
7. Produce an execution handoff plan (calls, parameters, sequencing, and risk notes). Do not sign, broadcast, deploy, or claim execution.
8. Define post-execution verification checks (balances, allowances, slippage) to run after the user confirms external execution.

## Guardrails

- This skill is read-only with mantle-mcp v0.2: never claim signed/broadcast/deployed/executed transactions.
- Do not proceed to external execution planning on `warn`/`high-risk` intents without explicit user confirmation.
- Reject unknown or unverified token/router addresses.
- Keep per-step idempotency notes for external retries.
- If the user asks for onchain execution, provide a handoff checklist and state that an external signer/wallet is required.

## Output Format

```text
Mantle DeFi Pre-Execution Report
- operation_type:
- environment:
- intent_summary:
- analyzed_at_utc:

Preparation
- quote_source:
- expected_output_min:
- allowance_status:
- approval_plan:

Execution Handoff
- recommended_calls:
- calldata_inputs:
- sequencing_notes:
- batched_execution_possible: yes | no

Post-Execution Verification Plan
- balances_to_recheck:
- allowances_to_recheck:
- slippage_checks:
- anomalies_to_watch:

Status
- readiness: ready | blocked | needs_input
- blocking_issues:
- next_action:
```

## References

- `references/defi-execution-guardrails.md`
- `references/swap-sop.md`
- `references/liquidity-sop.md`
