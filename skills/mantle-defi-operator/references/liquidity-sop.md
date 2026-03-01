# Liquidity SOP

Use this flow for add/remove liquidity pre-execution analysis.

## Add liquidity (planning)

1. Resolve pool address and token pair.
2. Fetch token decimals, reserves, and share math context.
3. Compute desired token amounts and min LP shares expected.
4. Check allowances for both tokens.
5. Determine whether approval(s) are required and specify minimum scope.
6. Prepare add-liquidity call parameters and sequencing for external execution.
7. Add post-execution checks for LP tokens received.

## Remove liquidity (planning)

1. Resolve pool and LP token details.
2. Read LP balance and allowance for pool/router.
3. Compute expected token outputs and minimums.
4. Determine whether LP approval is required and specify minimum scope.
5. Prepare remove-liquidity call parameters and sequencing for external execution.
6. Add post-execution checks for underlying assets received.

## Post-operation verification plan

- Define final wallet balances to re-check for all affected tokens after user-confirmed execution.
- Compare expected vs actual outputs once execution evidence is provided.
- Flag high slippage, shortfall, or unexpected extra fees as pending/observed.
