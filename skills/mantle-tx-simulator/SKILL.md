---
name: mantle-tx-simulator
description: Simulate Mantle transactions before broadcast and summarize expected outcomes in WYSIWYS form. Use when users need state-diff previews, gas estimates, revert diagnostics, or human-readable "what you sign is what you get" explanations.
---

# Mantle Tx Simulator

## Overview

Run deterministic transaction simulation on Mantle and translate technical diffs into user-readable expected outcomes before signing or execution.

## Workflow

1. Normalize simulation request:
   - network
   - from/to/value/data
   - optional bundle/multicall context
2. Select simulation backend using `references/simulation-backends.md`.
3. Capture pre-state:
   - relevant token balances
   - allowance values
   - nonce and gas context
4. Execute simulation and collect:
   - success/revert
   - gas estimate
   - logs/events
   - state diffs
5. Convert technical result into WYSIWYS summary with `references/wysiwys-template.md`.
6. If simulation fails or confidence is low, return `do_not_execute`.

## Guardrails

- Never broadcast real transactions from this skill.
- Distinguish simulated estimate from guaranteed execution result.
- If token decimals/pricing context is incomplete, state uncertainty explicitly.
- For bundle flows, describe each step and net effect.

## Output Format

```text
Mantle Simulation Report
- backend:
- environment:
- simulated_at_utc:
- status: success | revert | inconclusive
- tx_hash_simulated: <if available>

State Diff Summary
- assets_debited:
- assets_credited:
- approvals_changed:
- contract_state_changes:

Execution Estimates
- gas_estimate:
- estimated_fee_native:
- slippage_or_price_impact_note:

WYSIWYS
- plain_language_outcome:
- what_user_gives:
- what_user_gets_min:
- do_not_execute_reason: <empty if safe>
```

## References

- `references/simulation-backends.md`
- `references/wysiwys-template.md`
