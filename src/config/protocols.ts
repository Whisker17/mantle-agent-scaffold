import type { Network } from "../types.js";

interface ProtocolEntry {
  name: string;
  type: string;
  status: "enabled" | "planned";
  contracts: Record<string, string>;
  source_url?: string;
}

export const MANTLE_PROTOCOLS: Record<Network, Record<string, ProtocolEntry>> = {
  mainnet: {
    agni: {
      name: "Agni Finance",
      type: "dex",
      status: "enabled",
      source_url: "https://agni.finance",
      contracts: {
        swap_router: "0x319B69888b0d11cEC22caA5034e25FfFBDc88421",
        factory: "0x25780dc8Fc3cfBD75F33bFDAB65e969b603b2035",
        quoter_v2: "0xc4aaDc921E1cdb66c5300Bc158a313292923C0cb"
      }
    },
    merchant_moe: {
      name: "Merchant Moe",
      type: "dex",
      status: "enabled",
      source_url: "https://docs.merchantmoe.com/resources/contracts",
      contracts: {
        lb_router_v2_2: "0xeaEE7EE6886b7B4D35bcCC1345dCd4D135D2D1dC",
        lb_factory_v2_2: "0x5Beff0A63665db42f9A4D88a4b4A2364B6A0b33c",
        lb_quoter_v2_2: "0x8B800A0C9D1Fa98A39be7B84d66f5906caC3E3de"
      }
    },
    aave_v3: {
      name: "Aave V3",
      type: "lending",
      status: "enabled",
      source_url: "https://github.com/bgd-labs/aave-address-book/blob/main/src/ts/AaveV3Mantle.ts",
      contracts: {
        pool: "0x458F293454fE0d67EC0655f3672301301DD51422",
        pool_data_provider: "0x487c5c669D9eee6057C44973207101276cf73b68",
        pool_addresses_provider: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f"
      }
    },
    ondo: {
      name: "Ondo Finance",
      type: "rwa",
      status: "planned",
      contracts: {
        router: "BLOCKER: fill from Ondo official docs and verify on Mantlescan",
        vault_manager: "BLOCKER: fill from Ondo official docs and verify on Mantlescan"
      }
    }
  },
  sepolia: {}
};
