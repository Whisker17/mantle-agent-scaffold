import { describe, expect, it } from "vitest";
import { getLendingMarkets, getPoolLiquidity, getSwapQuote } from "../src/tools/defi-read.js";

describe("defi read tools", () => {
  it("returns swap quote from injected quote backend", async () => {
    const result = await getSwapQuote(
      {
        token_in: "USDC",
        token_out: "USDT",
        amount_in: "100",
        provider: "agni",
        network: "mainnet"
      },
      {
        quoteProvider: async () => ({
          estimated_out_raw: "100000000",
          estimated_out_decimal: "100",
          price_impact_pct: 0.12,
          route: "USDC->USDT",
          fee_tier: 500
        }),
        now: () => "2026-02-28T00:00:00.000Z"
      }
    );

    expect(result.provider).toBe("agni");
    expect(result.token_in.symbol).toBe("USDC");
    expect(result.estimated_out_decimal).toBe("100");
    expect(result.minimum_out_decimal).toBe("99.5");
    expect(result.router_address).toBe("0x319B69888b0d11cEC22caA5034e25FfFBDc88421");
  });

  it("queries both providers in best mode and returns the better quote", async () => {
    const calls: string[] = [];
    const result = await getSwapQuote(
      {
        token_in: "USDC",
        token_out: "USDT",
        amount_in: "100",
        provider: "best",
        network: "mainnet"
      },
      {
        quoteProvider: async ({ provider }) => {
          calls.push(provider);
          if (provider === "agni") {
            return {
              estimated_out_raw: "100000000",
              estimated_out_decimal: "100",
              price_impact_pct: 0.3,
              route: "USDC->USDT (agni)",
              fee_tier: 500
            };
          }
          return {
            estimated_out_raw: "101000000",
            estimated_out_decimal: "101",
            price_impact_pct: 0.2,
            route: "USDC->USDT (merchant_moe)",
            fee_tier: null
          };
        },
        now: () => "2026-02-28T00:00:00.000Z"
      }
    );

    expect(calls.sort()).toEqual(["agni", "merchant_moe"]);
    expect(result.provider).toBe("merchant_moe");
    expect(result.estimated_out_raw).toBe("101000000");
  });

  it("uses the surviving quote when one best-mode provider has no route", async () => {
    const result = await getSwapQuote(
      {
        token_in: "USDC",
        token_out: "USDT",
        amount_in: "100",
        provider: "best",
        network: "mainnet"
      },
      {
        quoteProvider: async ({ provider }) => {
          if (provider === "agni") {
            return null;
          }
          return {
            estimated_out_raw: "100500000",
            estimated_out_decimal: "100.5",
            price_impact_pct: 0.1,
            route: "USDC->USDT (merchant_moe)",
            fee_tier: null
          };
        },
        now: () => "2026-02-28T00:00:00.000Z"
      }
    );

    expect(result.provider).toBe("merchant_moe");
    expect(result.estimated_out_decimal).toBe("100.5");
  });

  it("rejects same-token swaps", async () => {
    await expect(
      getSwapQuote({
        token_in: "USDC",
        token_out: "USDC",
        amount_in: "1",
        network: "mainnet"
      })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("returns pool liquidity with null usd and warning on degradation", async () => {
    const result = await getPoolLiquidity(
      {
        pool_address: "0x1111111111111111111111111111111111111111",
        provider: "agni",
        network: "mainnet"
      },
      {
        readPool: async () => ({
          token_0: {
            address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
            symbol: "USDC",
            decimals: 6
          },
          token_1: {
            address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE",
            symbol: "USDT",
            decimals: 6
          },
          reserve_0_raw: "5000000000",
          reserve_1_raw: "5000000000",
          fee_tier: 500
        }),
        now: () => "2026-02-28T00:00:00.000Z"
      }
    );

    expect(result.total_liquidity_usd).toBeNull();
    expect(result.warnings.join(" ")).toContain("null");
  });

  it("derives pool liquidity USD when provider USD is unavailable", async () => {
    const result = await getPoolLiquidity(
      {
        pool_address: "0x1111111111111111111111111111111111111111",
        provider: "agni",
        network: "mainnet"
      },
      {
        readPool: async () => ({
          token_0: {
            address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
            symbol: "USDC",
            decimals: 6
          },
          token_1: {
            address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE",
            symbol: "USDT",
            decimals: 6
          },
          reserve_0_raw: "5000000000",
          reserve_1_raw: "5000000000",
          fee_tier: 500,
          total_liquidity_usd: null
        }),
        getTokenPrices: async () => ({
          "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9": 1,
          "0x201eba5cc46d216ce6dc03f6a759e8e766e956ae": 1
        }),
        now: () => "2026-02-28T00:00:00.000Z"
      }
    );

    expect(result.total_liquidity_usd).toBe(10000);
    expect(result.warnings).toEqual([]);
  });

  it("returns typed error when pool reserve payload is invalid", async () => {
    await expect(
      getPoolLiquidity(
        {
          pool_address: "0x1111111111111111111111111111111111111111",
          provider: "agni",
          network: "mainnet"
        },
        {
          readPool: async () => ({
            token_0: {
              address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
              symbol: "USDC",
              decimals: 6
            },
            token_1: {
              address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE",
              symbol: "USDT",
              decimals: 6
            },
            reserve_0_raw: "not-a-bigint",
            reserve_1_raw: "5000000000",
            fee_tier: 500
          })
        }
      )
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("supports aave alias and keeps tvl_usd null when unavailable", async () => {
    const result = await getLendingMarkets(
      {
        protocol: "aave",
        asset: "USDC",
        network: "mainnet"
      },
      {
        marketProvider: async () => [
          {
            protocol: "aave_v3",
            asset: "USDC",
            asset_address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
            supply_apy: 2.3,
            borrow_apy_variable: 3.1,
            borrow_apy_stable: null,
            tvl_usd: null,
            ltv: 80,
            liquidation_threshold: 85
          }
        ],
        now: () => "2026-02-28T00:00:00.000Z"
      }
    );

    expect(result.partial).toBe(false);
    expect(result.markets[0].protocol).toBe("aave_v3");
    expect(result.markets[0].tvl_usd).toBeNull();
  });

  it("throws typed error when aave market data is unavailable", async () => {
    await expect(
      getLendingMarkets(
        {
          protocol: "aave_v3",
          network: "mainnet"
        },
        {
          marketProvider: async () => [],
          now: () => "2026-02-28T00:00:00.000Z"
        }
      )
    ).rejects.toMatchObject({ code: "LENDING_DATA_UNAVAILABLE" });
  });
});
