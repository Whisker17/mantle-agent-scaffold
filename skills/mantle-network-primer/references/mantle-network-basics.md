# Mantle Network Basics

Use this file for factual grounding when answering Mantle onboarding and comparison questions.

## Source and freshness

- Primary source: https://docs.mantle.xyz/network/for-developers/quick-access
- Snapshot verified on: **February 28, 2026**
- If a user asks for the "latest" values, re-check Quick Access before answering.

## Core model

- Mantle is an Ethereum-aligned Layer 2 execution network.
- Users execute transactions on L2.
- Settlement/security assurances are anchored to Ethereum L1.
- Mantle is EVM-compatible and uses standard Ethereum tooling.

## Network details (Quick Access snapshot)

### Mainnet

- RPC URL: `https://rpc.mantle.xyz`
- WebSocket URL: `wss://rpc.mantle.xyz`
- Chain ID: `5000`
- Token symbol: `MNT`
- Explorer: `https://mantlescan.xyz/`

### Testnet (Sepolia)

- RPC URL: `https://rpc.sepolia.mantle.xyz`
- WebSocket URL: `N/A` (per Quick Access)
- Chain ID: `5003`
- Token symbol: `MNT`
- Explorer: `https://sepolia.mantlescan.xyz/`

## Onboarding tools (Quick Access snapshot)

### Mainnet

- Bridge: `https://app.mantle.xyz/bridge`
- Recommended Solidity compiler: `v0.8.23 or below`
- Wrapped MNT: `0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8`

### Testnet (Sepolia)

- Faucet: `https://faucet.sepolia.mantle.xyz/`
- Third-party faucets:
  - `https://faucet.quicknode.com/mantle/sepolia`
  - `https://thirdweb.com/mantle-sepolia-testnet/faucet`
- Bridge: `https://app.mantle.xyz/bridge?network=sepolia`
- Recommended Solidity compiler: `v0.8.23 or below`
- Wrapped MNT: `0x19f5557E23e9914A18239990f6C70D68FDF0deD5`
- Note: Mantle docs indicate Sepolia MNT can be requested directly from faucet (subject to limits).

## Contract and token source-of-truth

- L1 system contracts: `https://docs.mantle.xyz/network/system-information/on-chain-system/key-l1-contract-address`
- L2 system contracts: `https://docs.mantle.xyz/network/system-information/off-chain-system/key-l2-contract-address`
- Token list source-of-truth: `https://token-list.mantle.xyz`
- Bridge reference: `https://bridge.mantle.xyz`
- Token-list PR repo (for adding tokens): `https://github.com/mantlenetworkio/mantle-token-lists`

## RPC reliability guidance

- Mantle docs state official RPC endpoints are rate-limited for stability.
- For high-frequency or production workloads, prefer dedicated provider endpoints.
- Provider directory: `https://docs.mantle.xyz/network/for-developers/resources-and-tooling/node-endpoints-and-providers`

## Response rules for this skill

- Use absolute dates when quoting values from this file.
- Treat throughput, fee levels, ecosystem counts, and latency/finality windows as volatile.
- Distinguish:
  - `inclusion`: transaction appears in L2 block.
  - `L1-backed settlement finality`: strongest settlement assurance once L1 conditions are satisfied.
- For exact contract address lookups in execution contexts, cross-check with:
  - Mantle contract address pages above, or
  - `$mantle-address-registry-navigator` (if available in the runtime).

## Comparison checklist

When asked "Mantle vs another L2", compare:

1. EVM/tooling compatibility
2. Fee behavior under load
3. Settlement and data-availability assumptions
4. Finality profile
5. Ecosystem liquidity and app coverage
6. Operational maturity (wallets, explorers, RPC reliability)
