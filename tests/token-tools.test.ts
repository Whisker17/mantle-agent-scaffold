import { describe, expect, it } from "vitest";
import { MantleMcpError } from "../src/errors.js";
import { getTokenInfo, getTokenPrices, resolveToken } from "../src/tools/token.js";

describe("token tools", () => {
  it("reads token info", async () => {
    const result = await getTokenInfo(
      { token: "USDC", network: "mainnet" },
      {
        resolveTokenInput: async () => ({
          address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
          symbol: "USDC",
          decimals: 6
        }),
        readTokenMetadata: async () => ({
          name: "USD Coin",
          symbol: "USDC",
          decimals: 6,
          totalSupply: 5000000000000n
        }),
        now: () => "2026-02-28T00:00:00.000Z"
      }
    );

    expect(result.address).toBe("0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9");
    expect(result.symbol).toBe("USDC");
    expect(result.total_supply_normalized).toBe("5000000");
  });

  it("resolves token with token-list match", async () => {
    const result = await resolveToken(
      { symbol: "USDC", network: "mainnet", require_token_list_match: true },
      {
        fetchTokenListSnapshot: async () => ({
          version: "test-snapshot",
          tokens: [
            {
              chainId: 5000,
              address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
              symbol: "USDC",
              decimals: 6
            }
          ]
        })
      }
    );

    expect(result.address).toBe("0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9");
    expect(result.token_list_match).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("throws TOKEN_REGISTRY_MISMATCH when canonical list conflicts", async () => {
    await expect(
      resolveToken(
        { symbol: "USDC", network: "mainnet", require_token_list_match: true },
        {
          fetchTokenListSnapshot: async () => ({
            version: "test-snapshot",
            tokens: [
              {
                chainId: 5000,
                address: "0x1111111111111111111111111111111111111111",
                symbol: "USDC",
                decimals: 6
              }
            ]
          })
        }
      )
    ).rejects.toMatchObject({
      code: "TOKEN_REGISTRY_MISMATCH"
    });
  });

  it("never fabricates missing prices", async () => {
    const result = await getTokenPrices({
      tokens: ["UNKNOWN"],
      base_currency: "usd",
      network: "mainnet"
    });
    expect(result.partial).toBe(true);
    expect(result.prices[0].price).toBeNull();
    expect(result.prices[0].source).toBe("none");
  });

  it("rejects empty token list for pricing", async () => {
    await expect(
      getTokenPrices({
        tokens: [],
        base_currency: "usd",
        network: "mainnet"
      })
    ).rejects.toMatchObject({
      code: "INVALID_INPUT"
    });
  });
});
