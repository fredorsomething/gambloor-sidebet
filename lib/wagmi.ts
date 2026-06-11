"use client";

import { createConfig } from "@privy-io/wagmi";
import { http } from "wagmi";
import { mainnet, polygon } from "@/lib/viemChains";

const polygonRpc =
  process.env.NEXT_PUBLIC_POLYGON_RPC ||
  "https://polygon-bor-rpc.publicnode.com";

const ethereumRpc =
  process.env.NEXT_PUBLIC_ETHEREUM_RPC ||
  "https://ethereum.publicnode.com";

// Privy supplies the wallet connectors (embedded + external) at runtime, so the
// wagmi config only needs chains + transports. Do NOT add connectors here.
export const wagmiConfig = createConfig({
  chains: [polygon, mainnet],
  transports: {
    [polygon.id]: http(polygonRpc),
    [mainnet.id]: http(ethereumRpc),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
