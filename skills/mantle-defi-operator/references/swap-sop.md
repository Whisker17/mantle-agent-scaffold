# Swap SOP

Use this standard flow for token swap execution on Mantle.

## Step 1: Normalize input

- token in/out addresses
- exact input amount or exact output target
- recipient address
- slippage cap and deadline

## Step 2: Token metadata

- Fetch decimals and symbol for token in/out.
- Convert user amount to raw units.

## Step 3: Quote and route

- Query preferred aggregator/DEX route.
- Capture expected output and minimum output after slippage.
- Record quote timestamp and source.

## Step 4: Allowance check

- Read current allowance for spender/router.
- If insufficient:
  - prepare approval for minimum required amount
  - optionally batch approve+swap when account supports safe batching

## Step 5: Execute and monitor

- Submit swap transaction (or bundle).
- Wait for receipt confirmation.
- Capture gas usage and effective fee.

## Step 6: Settlement verification

- Re-read post-trade balances.
- Compare actual output versus expected minimum.
- Report slippage observed and anomalies.
