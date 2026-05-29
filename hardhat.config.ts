import "@nomicfoundation/hardhat-toolbox-viem";
import "dotenv/config";
import type { HardhatUserConfig } from "hardhat/config";

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const POLYGON_RPC_URL =
  process.env.POLYGON_RPC_URL?.trim() || "https://polygon-rpc.com";
const AMOY_RPC_URL =
  process.env.AMOY_RPC_URL?.trim() || "https://rpc-amoy.polygon.technology";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY?.trim() || "";

const accounts =
  DEPLOYER_PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(DEPLOYER_PRIVATE_KEY)
    ? [DEPLOYER_PRIVATE_KEY]
    : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {},
    amoy: {
      url: AMOY_RPC_URL,
      chainId: 80002,
      accounts,
    },
    polygon: {
      url: POLYGON_RPC_URL,
      chainId: 137,
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      polygon: POLYGONSCAN_API_KEY,
      polygonAmoy: POLYGONSCAN_API_KEY,
    },
    customChains: [
      {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
