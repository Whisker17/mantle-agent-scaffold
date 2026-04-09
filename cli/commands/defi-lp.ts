import type { Command } from "commander";
import { allTools } from "../../src/tools/index.js";
import { formatKeyValue, formatJson } from "../formatter.js";
import { parseIntegerOption, parseNumberOption, parseJsonArray } from "../utils.js";

/**
 * Liquidity provision operations:
 *   lp add    — Build unsigned add-liquidity transaction
 *   lp remove — Build unsigned remove-liquidity transaction
 */
export function registerLp(parent: Command): void {
  const group = parent
    .command("lp")
    .description("Liquidity provision operations (build unsigned transactions)");

  // ── add ─────────────────────────────────────────────────────────────
  group
    .command("add")
    .description(
      "Build unsigned add-liquidity transaction. " +
      "V3 (agni/fluxion) mints an NFT position; Merchant Moe LB adds to bins."
    )
    .requiredOption("--provider <provider>", "DEX provider: agni, fluxion, or merchant_moe")
    .requiredOption("--token-a <token>", "first token symbol or address")
    .requiredOption("--token-b <token>", "second token symbol or address")
    .requiredOption("--amount-a <amount>", "decimal amount of token A")
    .requiredOption("--amount-b <amount>", "decimal amount of token B")
    .requiredOption("--recipient <address>", "address to receive LP position")
    .option(
      "--slippage-bps <bps>",
      "slippage tolerance in basis points (default: 50)",
      (v: string) => parseIntegerOption(v, "--slippage-bps")
    )
    .option(
      "--fee-tier <tier>",
      "V3 fee tier (default: 3000). For agni/fluxion",
      (v: string) => parseNumberOption(v, "--fee-tier")
    )
    .option(
      "--tick-lower <tick>",
      "lower tick bound. For agni/fluxion. Default: full range",
      (v: string) => parseIntegerOption(v, "--tick-lower")
    )
    .option(
      "--tick-upper <tick>",
      "upper tick bound. For agni/fluxion. Default: full range",
      (v: string) => parseIntegerOption(v, "--tick-upper")
    )
    .option(
      "--bin-step <step>",
      "LB bin step (default: 20). For merchant_moe",
      (v: string) => parseIntegerOption(v, "--bin-step")
    )
    .option(
      "--active-id <id>",
      "active bin ID. For merchant_moe",
      (v: string) => parseIntegerOption(v, "--active-id")
    )
    .option(
      "--id-slippage <slippage>",
      "bin ID slippage tolerance. For merchant_moe",
      (v: string) => parseIntegerOption(v, "--id-slippage")
    )
    .option("--delta-ids <json>", "relative bin IDs as JSON array. For merchant_moe")
    .option("--distribution-x <json>", "token X distribution per bin as JSON array. For merchant_moe")
    .option("--distribution-y <json>", "token Y distribution per bin as JSON array. For merchant_moe")
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const result = await allTools["mantle_buildAddLiquidity"].handler({
        provider: opts.provider,
        token_a: opts.tokenA,
        token_b: opts.tokenB,
        amount_a: String(opts.amountA),
        amount_b: String(opts.amountB),
        recipient: opts.recipient,
        slippage_bps: opts.slippageBps,
        fee_tier: opts.feeTier,
        tick_lower: opts.tickLower,
        tick_upper: opts.tickUpper,
        bin_step: opts.binStep,
        active_id: opts.activeId,
        id_slippage: opts.idSlippage,
        delta_ids: opts.deltaIds ? parseJsonArray(opts.deltaIds as string, "--delta-ids") : undefined,
        distribution_x: opts.distributionX
          ? parseJsonArray(opts.distributionX as string, "--distribution-x")
          : undefined,
        distribution_y: opts.distributionY
          ? parseJsonArray(opts.distributionY as string, "--distribution-y")
          : undefined,
        network: globals.network
      });
      if (globals.json) {
        formatJson(result);
      } else {
        formatUnsignedTxResult(result as Record<string, unknown>);
      }
    });

  // ── remove ──────────────────────────────────────────────────────────
  group
    .command("remove")
    .description(
      "Build unsigned remove-liquidity transaction. " +
      "V3 uses decreaseLiquidity+collect; Merchant Moe LB removes from bins."
    )
    .requiredOption("--provider <provider>", "DEX provider: agni, fluxion, or merchant_moe")
    .requiredOption("--recipient <address>", "address to receive withdrawn tokens")
    .option("--token-id <id>", "V3 NFT position token ID. For agni/fluxion")
    .option("--liquidity <amount>", "amount of liquidity to remove. For agni/fluxion")
    .option("--token-a <token>", "first token symbol or address. For merchant_moe")
    .option("--token-b <token>", "second token symbol or address. For merchant_moe")
    .option(
      "--bin-step <step>",
      "LB bin step. For merchant_moe",
      (v: string) => parseIntegerOption(v, "--bin-step")
    )
    .option("--ids <json>", "bin IDs to remove from as JSON array. For merchant_moe")
    .option("--amounts <json>", "amounts per bin as JSON array. For merchant_moe")
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const provider = String(opts.provider).toLowerCase();

      // V3 providers require --token-id and --liquidity
      if (provider === "agni" || provider === "fluxion") {
        if (!opts.tokenId) {
          throw new Error("--token-id is required for V3 providers (agni/fluxion).");
        }
        if (!opts.liquidity) {
          throw new Error(
            "--liquidity is required for V3 providers (agni/fluxion). " +
            "Provide the amount of liquidity to remove (must be > 0)."
          );
        }
        const liq = BigInt(opts.liquidity as string);
        if (liq <= 0n) {
          throw new Error(
            "--liquidity must be a positive value. " +
            "A zero-liquidity removal would produce a no-op or fee-collect-only transaction."
          );
        }
      }

      const result = await allTools["mantle_buildRemoveLiquidity"].handler({
        provider: opts.provider,
        recipient: opts.recipient,
        token_id: opts.tokenId,
        liquidity: opts.liquidity,
        token_a: opts.tokenA,
        token_b: opts.tokenB,
        bin_step: opts.binStep,
        ids: opts.ids ? parseJsonArray(opts.ids as string, "--ids") : undefined,
        amounts: opts.amounts ? parseJsonArray(opts.amounts as string, "--amounts") : undefined,
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

  formatKeyValue(
    {
      intent: data.intent,
      human_summary: data.human_summary,
      tx_to: tx?.to,
      tx_value: tx?.value,
      tx_chainId: tx?.chainId,
      tx_data: truncateHex(tx?.data as string | undefined),
      tx_gas: tx?.gas ?? "auto",
      built_at: data.built_at_utc
    },
    {
      labels: {
        intent: "Intent",
        human_summary: "Summary",
        tx_to: "To",
        tx_value: "Value (hex)",
        tx_chainId: "Chain ID",
        tx_data: "Calldata",
        tx_gas: "Gas Limit",
        built_at: "Built At"
      }
    }
  );

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
