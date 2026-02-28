---
name: mantle-defi-operator
description: Execute multi-step Mantle DeFi actions with structured intent-to-receipt workflow. Use when handling swaps, liquidity add/remove operations, allowance preparation, batched approve+action flows, and post-trade settlement checks.
---

# Mantle Defi Operator

## Overview

Turn DeFi intent into deterministic execution steps on Mantle. Validate quote and allowance prerequisites, execute safely, and confirm final balances from receipts.

## Workflow

1. Normalize intent:
   - `swap`, `add_liquidity`, `remove_liquidity`, or compound flow
   - token addresses, amounts, recipient, deadline, slippage
2. Execute prep checks from `references/defi-execution-guardrails.md`.
3. Load operation SOP:
   - swap: `references/swap-sop.md`
   - liquidity: `references/liquidity-sop.md`
4. Resolve quote and route.
5. Check allowance; if insufficient, prepare `approve` step.
6. If account supports batching (for example ERC-4337 smart account), combine approve+action when safe.
7. Submit transaction(s), monitor receipt, and reconcile net asset changes.

## Guardrails

- Do not execute without explicit user confirmation on `warn`/`high-risk` intents.
- Reject unknown or unverified token/router addresses.
- Keep per-step idempotency notes for retries.
- Require receipt confirmation before declaring success.

## Output Format

```text
Mantle DeFi Execution Report
- operation_type:
- environment:
- intent_summary:
- executed_at_utc:

Preparation
- quote_source:
- expected_output_min:
- allowance_status:
- batched_execution: yes | no

Execution
- tx_hashes:
- receipts_confirmed:
- gas_spent_native:

Settlement
- expected_vs_actual_outcome:
- asset_delta_summary:
- slippage_observed:
- anomalies:

Status
- status: success | partial | failed
- next_action:
```

## References

- `references/defi-execution-guardrails.md`
- `references/swap-sop.md`
- `references/liquidity-sop.md`
