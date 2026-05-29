"use client";

import { createConfig } from "@privy-io/wagmi";
import { http } from "wagmi";
import { polygon } from "wagmi/chains";

const polygonRpc =
  process.env.NEXT_PUBLIC_POLYGON_RPC ||
  "https://polygon-bor-rpc.publicnode.com";

// Privy supplies the wallet connectors (embedded + external) at runtime, so the
// wagmi config only needs chains + transports. Do NOT add connectors here.
export const wagmiConfig = createConfig({
  chains: [polygon],
  transports: {
    [polygon.id]: http(polygonRpc),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
