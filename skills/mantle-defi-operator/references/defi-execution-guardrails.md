# DeFi Execution Guardrails

Apply these controls before any state-changing DeFi action.

## Address trust

- Resolve token/router/pool addresses via trusted registry or verified source.
- Block execution for unverified or malformed addresses.

## Intent completeness

- Ensure operation type, token amounts, recipient, slippage cap, and deadline are present.
- Block execution if any mandatory field is missing.

## Risk coupling

- Require latest preflight verdict from `$mantle-risk-evaluator` when available.
- For `warn`/`high-risk` outcomes, require explicit user confirmation.
- For `block` outcomes, do not execute.

## Allowance controls

- Prefer minimal required approval over unlimited approval.
- If unlimited approval is requested, require explicit user acknowledgement.
- Re-check allowance immediately before execution.

## Execution integrity

- Use deterministic calldata from selected route.
- Record all tx hashes and receipt statuses.
- Reconcile expected and actual token deltas after confirmation.
