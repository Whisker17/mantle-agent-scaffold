import { describe, expect, it } from "vitest";
import { getAllowances, getBalance, getTokenBalances } from "@mantleio/mantle-core/tools/account.js";

describe("account tools", () => {
  it("returns native MNT balance", async () => {
    const result = await getBalance(
      {
        address: "0x1111111111111111111111111111111111111111",
        network: "mainnet"
      },
      {
        getClient: () => ({
          getBlockNumber: async () => 999n,
          getBalance: async () => 1230000000000000000n
        }),
        now: () => "2026-02-28T00:00:00.000Z"
      }
    );

    expect(result.balance_wei).toBe("1230000000000000000");
    expect(result.balance_mnt).toBe("1.23");
    expect(result.block_number).toBe(999);
  });

  it("returns token balances and partial=true when one token read fails", async () => {
    const result = await getTokenBalances(
      {
        address: "0x1111111111111111111111111111111111111111",
        tokens: ["USDC", "BADTOKEN"],
        network: "mainnet"
      },
      {
        getClient: () => ({
          getBlockNumber: async () => 1000n
        }),
        resolveTokenInput: async (token) => {
          if (token === "USDC") {
            return {
              address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
              symbol: "USDC",
              decimals: 6
            };
          }
          throw new Error("unknown token");
        },
        readTokenBalancesBatch: async () => {
          return [{ status: "success" as const, balance: 1234567n }];
        },
        now: () => "2026-02-28T00:00:00.000Z"
      }
    );

    expect(result.partial).toBe(true);
    expect(result.balances).toHaveLength(2);
    expect(result.balances[0].balance_normalized).toBe("1.234567");
    expect(result.balances[0].error).toBeNull();
    expect(result.balances[1].error).toContain("unknown token");
  });

  it("uses multicall for batch balance reads", async () => {
    let batchAddresses: string[] = [];
    const result = await getTokenBalances(
      {
        address: "0x1111111111111111111111111111111111111111",
        tokens: ["USDC", "WETH"],
        network: "mainnet"
      },
      {
        getClient: () => ({
          getBlockNumber: async () => 2000n
        }),
        resolveTokenInput: async (token) => {
          if (token === "USDC") {
            return { address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", symbol: "USDC", decimals: 6 };
          }
          return { address: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111", symbol: "WETH", decimals: 18 };
        },
        readTokenBalancesBatch: async (_client, tokenAddresses) => {
          batchAddresses = tokenAddresses;
          return [
            { status: "success" as const, balance: 5_000000n },
            { status: "success" as const, balance: 1_000000000000000000n },
          ];
        },
        now: () => "2026-02-28T00:00:00.000Z"
      }
    );

    expect(batchAddresses).toHaveLength(2);
    expect(result.partial).toBe(false);
    expect(result.balances[0].balance_normalized).toBe("5");
    expect(result.balances[1].balance_normalized).toBe("1");
  });

  it("distinguishes multicall failure from genuine zero balance", async () => {
    const result = await getTokenBalances(
      {
        address: "0x1111111111111111111111111111111111111111",
        tokens: ["USDC", "WETH"],
        network: "mainnet"
      },
      {
        getClient: () => ({
          getBlockNumber: async () => 3000n
        }),
        resolveTokenInput: async (token) => {
          if (token === "USDC") {
            return { address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", symbol: "USDC", decimals: 6 };
          }
          return { address: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111", symbol: "WETH", decimals: 18 };
        },
        readTokenBalancesBatch: async () => {
          return [
            { status: "success" as const, balance: 0n },
            { status: "failure" as const, error: "multicall read failed" },
          ];
        },
        now: () => "2026-02-28T00:00:00.000Z"
      }
    );

    // USDC: genuine zero balance
    expect(result.balances[0].balance_raw).toBe("0");
    expect(result.balances[0].balance_normalized).toBe("0");
    expect(result.balances[0].error).toBeNull();

    // WETH: query failed
    expect(result.balances[1].balance_raw).toBe("0");
    expect(result.balances[1].balance_normalized).toBeNull();
    expect(result.balances[1].error).toBe("multicall read failed");

    expect(result.partial).toBe(true);
  });

  it("rejects native token in batch reads", async () => {
    const result = await getTokenBalances(
      {
        address: "0x1111111111111111111111111111111111111111",
        tokens: ["MNT"],
        network: "mainnet"
      },
      {
        getClient: () => ({
          getBlockNumber: async () => 4000n
        }),
        resolveTokenInput: async () => ({
          address: "native",
          symbol: "MNT",
          decimals: 18
        }),
        readTokenBalancesBatch: async () => [],
        now: () => "2026-02-28T00:00:00.000Z"
      }
    );

    expect(result.partial).toBe(true);
    expect(result.balances[0].error).toContain("native token");
  });

  it("degrades gracefully when batch multicall rejects entirely", async () => {
    const result = await getTokenBalances(
      {
        address: "0x1111111111111111111111111111111111111111",
        tokens: ["USDC", "WETH"],
        network: "mainnet"
      },
      {
        getClient: () => ({
          getBlockNumber: async () => 5000n
        }),
        resolveTokenInput: async (token) => {
          if (token === "USDC") {
            return { address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", symbol: "USDC", decimals: 6 };
          }
          return { address: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111", symbol: "WETH", decimals: 18 };
        },
        readTokenBalancesBatch: async () => {
          throw new Error("RPC transport timeout");
        },
        now: () => "2026-02-28T00:00:00.000Z"
      }
    );

    // Should NOT throw — returns structured response with per-token errors
    expect(result.partial).toBe(true);
    expect(result.balances).toHaveLength(2);
    expect(result.balances[0].error).toBe("RPC transport timeout");
    expect(result.balances[0].token_address).toBe("0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9");
    expect(result.balances[0].symbol).toBe("USDC");
    expect(result.balances[1].error).toBe("RPC transport timeout");
    expect(result.balances[1].token_address).toBe("0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111");
    expect(result.balances[1].symbol).toBe("WETH");
  });

  it("reads allowances and marks unlimited values", async () => {
    const result = await getAllowances(
      {
        owner: "0x1111111111111111111111111111111111111111",
        pairs: [
          { token: "USDC", spender: "0x319B69888b0d11cEC22caA5034e25FfFBDc88421" }
        ],
        network: "mainnet"
      },
      {
        getClient: () => ({
          getBlockNumber: async () => 1001n
        }),
        resolveTokenInput: async () => ({
          address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
          symbol: "USDC",
          decimals: 6
        }),
        readTokenAllowance: async () => (2n ** 255n) + 1n,
        resolveSpenderLabel: () => "Agni Router",
        now: () => "2026-02-28T00:00:00.000Z"
      }
    );

    expect(result.partial).toBe(false);
    expect(result.allowances[0].token_symbol).toBe("USDC");
    expect(result.allowances[0].spender_label).toBe("Agni Router");
    expect(result.allowances[0].is_unlimited).toBe(true);
  });
});
