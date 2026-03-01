# DeFi Pre-Execution Guardrails

Apply these controls before any potential state-changing DeFi action.

## Capability boundary (mantle-mcp v0.2)

- `mantle-mcp` v0.2 in this repo is read-focused and does not sign, broadcast, deploy, or execute transactions.
- This skill must stop at analysis + plan generation.
- Never fabricate tx hashes, receipts, or settlement outcomes.

## Address trust

- Resolve token/router/pool addresses via trusted registry or verified source.
- Mark the plan as blocked for unverified or malformed addresses.

## Intent completeness

- Ensure operation type, token amounts, recipient, slippage cap, and deadline are present.
- Mark the plan as blocked if any mandatory field is missing.

## Risk coupling

- Require latest preflight verdict from `$mantle-risk-evaluator` when available.
- For `warn`/`high-risk` outcomes, require explicit user confirmation.
- For `block` outcomes, do not produce an execution-ready plan.

## Allowance controls

- Prefer minimal required approval over unlimited approval.
- If unlimited approval is requested, require explicit user acknowledgement.
- Include an explicit allowance re-check in the external execution checklist.

## Execution handoff integrity

- Use deterministic route and calldata inputs from selected quote/liquidity context.
- Record required call sequence and parameter values for the external executor.
- Define post-execution reconciliation checks (balances/allowances/slippage) to run after user-confirmed execution.
