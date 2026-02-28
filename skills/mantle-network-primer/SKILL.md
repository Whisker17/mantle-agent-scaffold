---
name: mantle-network-primer
description: Explain Mantle network fundamentals for onboarding and comparison requests. Use when users ask what Mantle is, how Mantle differs from other L2s, why MNT is needed for gas, or how Mantle relates to Ethereum L1 settlement and finality.
---

# Mantle Network Primer

## Overview

Provide accurate onboarding explanations about Mantle without guessing volatile metrics. Ground responses in `references/mantle-network-basics.md`, then clearly mark which details are stable concepts versus values that must be verified live.

## Workflow

1. Classify the request as `basics`, `comparison`, or `operations`.
2. Load the matching section from `references/mantle-network-basics.md`.
3. Respond in two layers:
   - One-sentence summary.
   - Three to five bullets with practical implications.
4. For time-sensitive questions (fees, block time, throughput, current ecosystem status), state that values can change and request live verification from official docs or tools.
5. For Mantle-vs-other-L2 questions, present trade-offs rather than absolute rankings.

## Response Rules

- Define key terms once: `sequencer`, `settlement`, `finality`, `gas token`.
- Distinguish transaction inclusion from final settlement.
- Use absolute dates for time-bound statements.
- Avoid financial advice and price predictions.
- If confidence is low, say so directly and request a source check.

## Quick Templates

### Basic primer

`Mantle is an Ethereum-aligned Layer 2 execution network. Users transact on L2 and pay gas in MNT, while strongest settlement guarantees are tied to Ethereum L1.`

### Comparison answer

`Mantle and {other_network} are both L2 environments, but they can differ on fee behavior, finality profile, and ecosystem depth. The right choice depends on cost, latency, and application requirements.`

## References

- `references/mantle-network-basics.md`
