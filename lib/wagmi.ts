"use client";

import { createConfig, http } from "wagmi";
import { polygon, polygonAmoy } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID?.trim();

const polygonRpc =
  process.env.NEXT_PUBLIC_POLYGON_RPC || "https://polygon-rpc.com";
const amoyRpc =
  process.env.NEXT_PUBLIC_AMOY_RPC || "https://rpc-amoy.polygon.technology";

/**
 * Connectors are built directly from wagmi rather than RainbowKit so the
 * injected (MetaMask / browser wallet) and Coinbase Wallet flows work with
 * zero external configuration. WalletConnect is only added when a project id
 * is present, so a missing/placeholder id can never break the modal.
 */
const connectors = [
  injected({ shimDisconnect: true }),
  coinbaseWallet({ appName: "Sidebet", preference: "all" }),
  ...(projectId
    ? [
        walletConnect({
          projectId,
          showQrModal: true,
          metadata: {
            name: "Sidebet",
            description: "Peer-to-peer escrowed side bets on Polygon",
            url: "https://sidebet.app",
            icons: [],
          },
        }),
      ]
    : []),
];

export const HAS_WALLETCONNECT = Boolean(projectId);

export const wagmiConfig = createConfig({
  chains: [polygonAmoy, polygon],
  connectors,
  transports: {
    [polygon.id]: http(polygonRpc),
    [polygonAmoy.id]: http(amoyRpc),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
