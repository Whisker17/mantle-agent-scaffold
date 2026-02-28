# Liquidity SOP

Use this flow for add/remove liquidity operations.

## Add liquidity

1. Resolve pool address and token pair.
2. Fetch token decimals, reserves, and share math context.
3. Compute desired token amounts and min LP shares expected.
4. Check allowances for both tokens.
5. Submit approval(s) if required.
6. Submit add-liquidity transaction.
7. Confirm receipt and validate LP tokens received.

## Remove liquidity

1. Resolve pool and LP token details.
2. Read LP balance and allowance for pool/router.
3. Compute expected token outputs and minimums.
4. Submit approval if LP allowance is insufficient.
5. Submit remove-liquidity transaction.
6. Confirm receipt and validate underlying assets received.

## Post-operation checks

- Confirm final wallet balances for all affected tokens.
- Compare expected vs actual outputs.
- Flag high slippage, shortfall, or unexpected extra fees.
