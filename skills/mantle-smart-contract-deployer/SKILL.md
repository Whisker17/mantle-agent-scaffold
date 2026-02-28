---
name: mantle-smart-contract-deployer
description: Deploy and verify smart contracts on Mantle with a deterministic release workflow. Use when preparing build artifacts, estimating deployment gas, submitting deployment transactions, and publishing verified source metadata on Mantle explorers.
---

# Mantle Smart Contract Deployer

## Overview

Execute a safe deploy pipeline from compile to explorer verification. Produce reproducible deployment records and stop when pre-deploy checks fail.

## Workflow

1. Collect deployment inputs:
   - source path and contract name
   - compiler version and optimizer settings
   - constructor args
   - target environment (`mainnet` or `testnet`)
2. Run pre-deploy checks from `references/deployment-checklist.md`.
3. Build artifacts and bytecode fingerprint.
4. Estimate gas and deployment cost; confirm limits.
5. Submit deployment transaction through configured signer.
6. Wait for receipt and persist deployment metadata.
7. Verify source on explorer using `references/verification-playbook.md`.

## Guardrails

- Never deploy with unresolved constructor argument ambiguity.
- Never skip chain ID or environment confirmation.
- Never claim verification success without explorer response evidence.
- If compile hash changes after quote/approval, restart pre-deploy checks.

## Output Format

```text
Mantle Deployment Report
- contract_name:
- environment:
- chain_id:
- compiler_profile:
- bytecode_hash:

Deployment
- tx_hash:
- deployed_address:
- block_number:
- gas_used:
- deployment_fee_native:

Verification
- explorer:
- status: verified | pending | failed
- verification_id_or_link:
- failure_reason:

Artifacts
- constructor_args_encoded:
- abi_path:
- metadata_path:
```

## References

- `references/deployment-checklist.md`
- `references/verification-playbook.md`
