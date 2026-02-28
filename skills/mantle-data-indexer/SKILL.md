---
name: mantle-data-indexer
description: Query and summarize Mantle historical onchain activity through indexers. Use when tasks need time-windowed metrics, wallet action history, pool or protocol analytics, or event backfills that are inefficient with raw RPC alone.
---

# Mantle Data Indexer

## Overview

Use GraphQL or SQL indexers to answer historical questions on Mantle with reproducible queries, clear time boundaries, and source attribution.

## Workflow

1. Normalize request:
   - objective (for example volume, swaps, user history)
   - entities (wallet, pool, token, protocol)
   - time range (absolute UTC start/end)
2. Select source by availability and latency target:
   - GraphQL indexer
   - SQL indexer
3. Build query from `references/query-templates.md`.
4. Execute with pagination and deterministic ordering.
5. Normalize units and decimals before aggregation.
6. Produce output with query provenance and caveats.

## Guardrails

- Confirm chain scope is Mantle before querying.
- Use absolute timestamps and include timezone (`UTC`).
- Do not merge datasets with mismatched granularity without labeling.
- Distinguish `no data` from `query failure`.
- If indexer lag is known or suspected, disclose it.

## Output Format

```text
Mantle Historical Data Report
- objective:
- source_type: graphql | sql
- source_endpoint:
- queried_at_utc:
- time_range_utc:
- entity_scope:

Query Summary
- dataset_or_subgraph:
- filters_applied:
- pagination_strategy:
- records_scanned:

Results
- metric_1:
- metric_2:
- sample_rows:

Quality Notes
- indexer_lag_status:
- assumptions:
- caveats:
- confidence:
```

## References

- `references/indexer-selection-and-quality.md`
- `references/query-templates.md`
