# Indexer Selection and Quality

Use this guide to choose index sources and communicate confidence.

## Source choice

- Choose `GraphQL` when:
  - A maintained subgraph exists.
  - You need flexible entity filtering and nested fields.
- Choose `SQL` when:
  - A warehouse/indexer table exists for the target protocol.
  - You need heavy aggregations or window functions.

## Required metadata in every answer

- `source_type` (`graphql` or `sql`)
- Endpoint or dataset name
- Time range in absolute UTC timestamps
- Query execution time (`queried_at_utc`)
- Known lag status (if available)

## Data quality checks

1. Confirm chain scope is Mantle.
2. Confirm timestamp units (`seconds` vs `milliseconds`).
3. Confirm decimal normalization assumptions.
4. Confirm pagination did not truncate data.
5. Confirm sorting/order key is deterministic.

## Lag and completeness policy

- If lag is unknown, say `lag status unknown`.
- If lag is known and non-trivial, include impact statement.
- If query fails partway, report partial result with clear boundary.

## Common failure modes

- Query returns zero rows because wrong network or wrong entity ID.
- Aggregation mismatch due to unnormalized token decimals.
- Double-counting due to overlapping pagination windows.
- Misleading totals due to mixed time granularities.
