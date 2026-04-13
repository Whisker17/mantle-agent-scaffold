import type { Command } from "commander";
import { allTools } from "@mantleio/mantle-core/tools/index.js";
import { formatKeyValue, formatJson } from "../formatter.js";

export function registerChain(parent: Command): void {
  const group = parent.command("chain").description("Chain information");

  group
    .command("info")
    .description("Static chain configuration for mainnet or sepolia")
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const result = await allTools["mantle_getChainInfo"].handler({
        network: globals.network
      });
      if (globals.json) {
        formatJson(result);
      } else {
        const data = result as Record<string, unknown>;
        formatKeyValue(data, {
          order: [
            "chain_id", "name", "native_token", "rpc_url", "ws_url",
            "explorer_url", "bridge_url", "wrapped_mnt",
            "recommended_solidity_compiler", "faucet_urls"
          ],
          labels: {
            chain_id: "Chain ID",
            name: "Name",
            native_token: "Native Token",
            rpc_url: "RPC URL",
            ws_url: "WebSocket URL",
            explorer_url: "Explorer",
            bridge_url: "Bridge",
            wrapped_mnt: "WMNT Address",
            recommended_solidity_compiler: "Solidity Compiler",
            faucet_urls: "Faucet URLs"
          }
        });
      }
    });

  group
    .command("status")
    .description("Live block height and gas price from Mantle RPC")
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const result = await allTools["mantle_getChainStatus"].handler({
        network: globals.network
      });
      if (globals.json) {
        formatJson(result);
      } else {
        const data = result as Record<string, unknown>;
        formatKeyValue(data, {
          order: ["chain_id", "block_number", "gas_price_gwei", "syncing", "timestamp_utc"],
          labels: {
            chain_id: "Chain ID",
            block_number: "Block",
            gas_price_gwei: "Gas Price (Gwei)",
            syncing: "Syncing",
            timestamp_utc: "Timestamp"
          }
        });
      }
    });

  group
    .command("tx")
    .description("Fetch on-chain transaction receipt by hash")
    .requiredOption("--hash <hash>", "transaction hash (0x-prefixed)")
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const result = await allTools["mantle_getTransactionReceipt"].handler({
        hash: opts.hash,
        network: globals.network
      });
      if (globals.json) {
        formatJson(result);
      } else {
        const data = result as Record<string, unknown>;
        formatKeyValue(data, {
          order: [
            "hash", "status", "block_number", "from", "to",
            "value_mnt", "fee_mnt", "gas_used",
            "effective_gas_price_gwei", "logs_count", "contract_address"
          ],
          labels: {
            hash: "TX Hash",
            status: "Status",
            block_number: "Block",
            from: "From",
            to: "To",
            value_mnt: "Value (MNT)",
            fee_mnt: "Fee (MNT)",
            gas_used: "Gas Used",
            effective_gas_price_gwei: "Gas Price (Gwei)",
            logs_count: "Event Logs",
            contract_address: "Contract Created"
          }
        });
      }
    });

  group
    .command("estimate-gas")
    .description("Estimate gas cost for an unsigned transaction")
    .requiredOption("--to <address>", "target contract address from unsigned_tx")
    .option("--from <address>", "sender address for context-aware estimation (recommended)")
    .option("--data <hex>", "calldata from unsigned_tx (hex string)")
    .option("--value <hex>", "value from unsigned_tx (hex string, default 0x0)")
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const result = await allTools["mantle_estimateGas"].handler({
        to: opts.to,
        from: opts.from,
        data: opts.data,
        value: opts.value,
        network: globals.network
      });
      if (globals.json) {
        formatJson(result);
      } else {
        const data = result as Record<string, unknown>;
        formatKeyValue(data, {
          order: ["gas_limit", "gas_price_gwei", "estimated_fee_mnt", "network"],
          labels: {
            gas_limit: "Gas Limit",
            gas_price_gwei: "Gas Price (Gwei)",
            estimated_fee_mnt: "Est. Fee (MNT)",
            network: "Network"
          }
        });
      }
    });
}
