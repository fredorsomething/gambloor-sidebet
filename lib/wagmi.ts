"use client";

import { createConfig, http } from "wagmi";
import { polygon } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID?.trim();

const polygonRpc =
  process.env.NEXT_PUBLIC_POLYGON_RPC ||
  "https://polygon-bor-rpc.publicnode.com";

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
  chains: [polygon],
  connectors,
  transports: {
    [polygon.id]: http(polygonRpc),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
