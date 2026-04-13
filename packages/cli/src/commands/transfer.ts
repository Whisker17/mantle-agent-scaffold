import type { Command } from "commander";
import { allTools } from "@mantleio/mantle-core/tools/index.js";
import { formatKeyValue, formatJson } from "../formatter.js";

/**
 * Token transfer operations:
 *   transfer send-native  — Build unsigned native MNT transfer
 *   transfer send-token   — Build unsigned ERC-20 token transfer
 */
export function registerTransfer(parent: Command): void {
  const group = parent
    .command("transfer")
    .description("Token transfer operations (build unsigned transactions)");

  // ── send-native ──────────────────────────────────────────────────────
  group
    .command("send-native")
    .description("Build an unsigned native MNT transfer transaction")
    .requiredOption("--to <address>", "recipient address")
    .requiredOption("--amount <amount>", "decimal amount of MNT to send")
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const result = await allTools["mantle_buildTransferNative"].handler({
        to: opts.to,
        amount: String(opts.amount),
        network: globals.network
      });
      if (globals.json) {
        formatJson(result);
      } else {
        formatUnsignedTxResult(result as Record<string, unknown>);
      }
    });

  // ── send-token ───────────────────────────────────────────────────────
  group
    .command("send-token")
    .description("Build an unsigned ERC-20 token transfer transaction")
    .requiredOption("--token <token>", "token symbol or address")
    .requiredOption("--to <address>", "recipient address")
    .requiredOption("--amount <amount>", "decimal amount of tokens to send")
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const result = await allTools["mantle_buildTransferToken"].handler({
        token: opts.token,
        to: opts.to,
        amount: String(opts.amount),
        network: globals.network
      });
      if (globals.json) {
        formatJson(result);
      } else {
        formatUnsignedTxResult(result as Record<string, unknown>);
      }
    });
}

// ---------------------------------------------------------------------------
// Shared formatter for unsigned-tx results
// ---------------------------------------------------------------------------

function formatUnsignedTxResult(data: Record<string, unknown>): void {
  const tx = data.unsigned_tx as Record<string, unknown> | undefined;
  const warnings = (data.warnings ?? []) as string[];
  const tokenInfo = data.token_info as Record<string, unknown> | undefined;

  const fields: Record<string, unknown> = {
    intent: data.intent,
    human_summary: data.human_summary,
    tx_to: tx?.to,
    tx_value: tx?.value,
    tx_chainId: tx?.chainId,
    tx_data: truncateHex(tx?.data as string | undefined),
    built_at: data.built_at_utc
  };

  const labels: Record<string, string> = {
    intent: "Intent",
    human_summary: "Summary",
    tx_to: "To",
    tx_value: "Value (hex)",
    tx_chainId: "Chain ID",
    tx_data: "Calldata",
    built_at: "Built At"
  };

  if (tokenInfo) {
    const tin = tokenInfo.token_in as Record<string, unknown> | undefined;
    if (tin) {
      fields.token = `${tin.symbol} (${tin.decimals} decimals)`;
      labels.token = "Token";
    }
  }

  formatKeyValue(fields, { labels });

  if (warnings.length > 0) {
    console.log("  Warnings:");
    for (const w of warnings) {
      console.log(`    - ${w}`);
    }
    console.log();
  }
}

function truncateHex(hex: string | undefined): string {
  if (!hex) return "null";
  if (hex.length <= 66) return hex;
  return `${hex.slice(0, 34)}...${hex.slice(-16)} (${hex.length} chars)`;
}
