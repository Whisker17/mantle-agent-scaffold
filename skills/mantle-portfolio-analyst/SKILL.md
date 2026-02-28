---
name: mantle-portfolio-analyst
description: Produce read-only Mantle portfolio and approval exposure reports. Use when tasks require native MNT balance checks, ERC-20 holdings analysis, spender allowance audits, or identifying unlimited-approval risk before DeFi actions.
---

# Mantle Portfolio Analyst

## Overview

Build deterministic, read-only wallet analysis on Mantle. Enumerate balances and allowances, then highlight approval risk in a structured report.

## Workflow

1. Confirm inputs:
   - `wallet_address`
   - `environment` (`mainnet` or `testnet`)
   - optional token/spender scope
2. Resolve environment RPC endpoint and chain ID.
3. Fetch native balance (`eth_getBalance`) and convert from wei.
4. Enumerate token balances using ERC-20 reads:
   - `balanceOf(wallet)`
   - `decimals()`
   - `symbol()` or fallback label
5. Enumerate allowances per token-spender pair with `allowance(owner, spender)`.
6. Classify approval risk with `references/allowance-risk-rules.md`.
7. Return formatted report with findings, confidence, and data timestamp.

## Guardrails

- Stay read-only; do not construct or send transactions.
- Do not guess token decimals or symbols if calls fail.
- Validate checksummed addresses for wallet, token, and spender.
- Mark missing token metadata as `unknown` and continue.
- If RPC responses are inconsistent, report partial coverage explicitly.

## Report Format

```text
Mantle Portfolio Report
- wallet:
- environment:
- chain_id:
- collected_at_utc:

Native Balance
- MNT:

Token Balances
- token: <symbol_or_label>
  address:
  balance_raw:
  decimals:
  balance_normalized:

Allowance Exposure
- token:
  spender:
  allowance_raw:
  allowance_normalized:
  risk_level: low | medium | high | critical
  rationale:

Summary
- tokens_with_balance:
- allowances_checked:
- unlimited_or_near_unlimited_count:
- key_risks:
- confidence:
```

## References

- `references/rpc-readonly-workflow.md`
- `references/allowance-risk-rules.md`
