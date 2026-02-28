# Verification Playbook

Use this workflow to verify deployed contracts on Mantle explorers.

## Required inputs

- deployed contract address
- contract source path and contract name
- compiler version
- optimizer enabled/runs
- constructor arguments (raw and encoded)
- linked library addresses (if any)

## Steps

1. Confirm deployed bytecode exists at target address.
2. Submit verification payload to explorer API/UI.
3. Poll verification status until success/failure/timeout.
4. Record verification link or identifier.

## Common failures and fixes

- Compiler mismatch:
  - Rebuild with exact compiler version used at deployment.
- Optimizer mismatch:
  - Match enable flag and run count exactly.
- Constructor args mismatch:
  - Re-encode with precise argument order and types.
- Metadata/library mismatch:
  - Provide fully qualified library mapping.

## Evidence requirements

- Keep full request payload snapshot (excluding secrets).
- Keep explorer response body and timestamp.
- Do not claim "verified" without explicit success response.
