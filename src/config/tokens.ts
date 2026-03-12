import type { Network } from "../types.js";

export interface TokenEntry {
  address: string;
  decimals: number;
  name: string;
  symbol: string;
}

export const MANTLE_TOKENS: Record<Network, Record<string, TokenEntry>> = {
  mainnet: {
    MNT: { address: "native", decimals: 18, name: "Mantle", symbol: "MNT" },
    WMNT: {
      address: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8",
      decimals: 18,
      name: "Wrapped Mantle",
      symbol: "WMNT"
    },
    WETH: {
      address: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111",
      decimals: 18,
      name: "Wrapped Ether",
      symbol: "WETH"
    },
    USDC: {
      address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
      decimals: 6,
      name: "USD Coin",
      symbol: "USDC"
    },
    USDT: {
      address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE",
      decimals: 6,
      name: "Tether",
      symbol: "USDT"
    },
    mETH: {
      address: "0xcDA86A272531e8640cD7F1a92c01839911B90bb0",
      decimals: 18,
      name: "Mantle Staked ETH",
      symbol: "mETH"
    },
    cmETH: {
      address: "0xE6829d9a7eE3040e1276Fa75293Bde931859e8fA",
      decimals: 18,
      name: "Restaked mETH",
      symbol: "cmETH"
    }
  },
  sepolia: {
    MNT: { address: "native", decimals: 18, name: "Mantle", symbol: "MNT" },
    WMNT: {
      address: "0x19f5557E23e9914A18239990f6C70D68FDF0deD5",
      decimals: 18,
      name: "Wrapped Mantle",
      symbol: "WMNT"
    }
  }
};
