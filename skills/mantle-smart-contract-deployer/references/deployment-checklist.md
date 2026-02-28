# Deployment Checklist

Run this checklist before sending a deployment transaction.

## Environment checks

- Confirm target environment (`mainnet` or `testnet`).
- Confirm expected chain ID and RPC endpoint.
- Confirm deployer address and sufficient native balance for gas.

## Build checks

- Confirm compiler version and optimizer settings.
- Confirm bytecode reproducibility from clean build.
- Confirm ABI and metadata artifacts exist.
- Confirm constructor args are complete and correctly encoded.

## Safety checks

- Confirm no unresolved TODO/debug flags in source.
- Confirm external dependency addresses are network-correct.
- Confirm ownership/admin initialization values are intentional.

## Cost checks

- Estimate deployment gas.
- Estimate native fee using current gas pricing.
- Compare estimate against max cost constraint.

## Final gate

- If any required check fails: stop deployment.
- If all checks pass: proceed to transaction submission.
