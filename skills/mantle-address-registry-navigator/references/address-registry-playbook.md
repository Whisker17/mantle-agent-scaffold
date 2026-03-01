# Address Registry Playbook

Use this file with `assets/registry.json` to keep address lookups deterministic and auditable.

## Resolution Policy

- Runtime tools in mantle-mcp v0.2:
  - Use `mantle_resolveToken` for token symbols/names.
  - Use `mantle_resolveAddress` for contract key/alias/label lookups.
  - Use `mantle_validateAddress` before returning any final address.
  - Do not reference `get_contract_address` (not available in v0.2).
- Prefer machine-readable sources over free text.
- Treat missing or stale provenance as a safety failure.
- Fail closed: no verified entry means no address output.

## Registry Fields

Each `contracts[]` entry should include:

- `key`: stable lookup key (`WETH`, `OFFICIAL_BRIDGE`, and so on)
- `label`: human-readable name
- `environment`: `mainnet` or `testnet` (runtime `network=sepolia` maps to `testnet`)
- `category`: `system`, `token`, `bridge`, or `defi`
- `address`: EIP-55 checksum address
- `status`: `active`, `deprecated`, `paused`, or `unknown`
- `is_official`: boolean
- `source.url`: canonical source page
- `source.retrieved_at`: ISO-8601 timestamp
- `aliases`: optional alternate names/symbols

## Lookup Strategy

1. If MCP tools are available, resolve through `mantle_resolveToken`/`mantle_resolveAddress` first.
2. Local fallback: exact match on `key`.
3. Local fallback: exact match on alias/symbol.
4. Local fallback: case-insensitive match on `label`.
5. If multiple matches remain, stop and request disambiguation.

## Freshness Guidance

- Prefer entries verified within the last 30 days.
- If older than 30 days, set confidence to `medium`.
- If no timestamp exists, set confidence to `low` and require manual confirmation.
- If `status` is not `active`, do not treat as executable target.

## Update Procedure

1. Gather source from official Mantle docs, official protocol docs, or a verified explorer contract page.
2. Update or add the entry in `assets/registry.json`.
3. Set `source.retrieved_at` and top-level `updated_at` to current UTC timestamp.
4. Preserve old entries by marking them `deprecated` instead of deleting immediately.
5. Re-run validation checks before using updated entries for execution tasks.

## Suggested Validation Checks

- Address format and checksum.
- No placeholder/template values (for example `REPLACE_WITH_EIP55_CHECKSUM_ADDRESS`).
- Duplicated keys within the same environment.
- Duplicated active addresses with conflicting labels.
- Missing source URL or retrieved timestamp.
