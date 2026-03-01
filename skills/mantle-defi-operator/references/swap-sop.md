# Swap SOP

Use this standard flow for token swap pre-execution analysis on Mantle.

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
  - note whether external executor can safely batch approve+swap

## Step 5: Build execution handoff plan

- Build a deterministic call sequence (approve if needed, then swap).
- Include router/spender, raw amounts, recipient, deadline, and slippage-bound minimum output.
- State explicitly that execution must happen in an external signer/wallet flow.

## Step 6: Post-execution verification plan

- Define which balances and allowances to re-read after user-confirmed execution.
- Compare observed output versus expected minimum once execution evidence is provided.
- Report slippage/anomalies as pending until post-execution data is available.
