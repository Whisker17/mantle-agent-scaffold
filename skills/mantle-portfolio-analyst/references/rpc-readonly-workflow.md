# RPC Read-Only Workflow

Use this guide to gather wallet balances and allowances without state changes.

## Required inputs

- Wallet address
- Environment (`mainnet` or `testnet`)
- Token set and spender set (user-provided or discovered)

## Call sequence

1. `eth_chainId`
2. `eth_getBalance(wallet, latest)`
3. For each token:
   - `decimals()`
   - `symbol()`
   - `balanceOf(wallet)`
4. For each token-spender pair:
   - `allowance(wallet, spender)`

## Token and spender discovery

- Prefer explicit user scope first.
- Reuse trusted addresses from `$mantle-address-registry-navigator` when available.
- If scope is still unknown, report that coverage is partial instead of inventing targets.

## Normalization rules

- Convert native and ERC-20 values from raw integers using token decimals.
- Keep both `raw` and `normalized` values in output.
- If decimals are unavailable, keep raw only and mark confidence lower.

## Reliability checks

- Verify response chain ID matches requested environment.
- Retry transient RPC errors with bounded attempts.
- Detect and report partial failures per token/spender.
- Include `collected_at_utc` timestamp in final report.
