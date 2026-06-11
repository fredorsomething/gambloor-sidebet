import { defineChain } from "viem";

/**
 * Sidebet only uses Polygon + Ethereum. Define them here instead of importing
 * from `viem/chains` / `wagmi/chains` barrel exports, which pull in every chain
 * (including Tempo) and trigger ox webpack critical-dependency warnings.
 */
export const polygon = defineChain({
  id: 137,
  name: "Polygon",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_POLYGON_RPC ||
          "https://polygon-bor-rpc.publicnode.com",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "PolygonScan",
      url: "https://polygonscan.com",
    },
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 25770160,
    },
  },
});

export const mainnet = defineChain({
  id: 1,
  name: "Ethereum",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_ETHEREUM_RPC ||
          "https://ethereum.publicnode.com",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Etherscan",
      url: "https://etherscan.io",
    },
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 14353601,
    },
  },
});
