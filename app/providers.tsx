"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { polygon } from "wagmi/chains";

import { wagmiConfig } from "@/lib/wagmi";
import { ToastProvider } from "@/components/ui/Toast";
import { FundWalletProvider } from "@/components/wallet/FundWalletModal";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_CLIENT_ID = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );

  if (!PRIVY_APP_ID) {
    // Without an app id Privy can't initialize. Surface a clear message instead
    // of an opaque runtime crash so deploys without the env var are obvious.
    return (
      <div className="mx-auto mt-16 max-w-lg rounded-xl border border-danger/40 bg-danger/10 p-6 text-sm text-danger">
        <p className="font-semibold">Privy is not configured.</p>
        <p className="mt-1">
          Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> (and{" "}
          <code>PRIVY_APP_SECRET</code> on the server) to enable sign in.
        </p>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID}
      config={{
        loginMethods: ["email", "sms", "google", "wallet"],
        appearance: {
          theme: "light",
          accentColor: "#6366f1",
          walletChainType: "ethereum-only",
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
        defaultChain: polygon,
        supportedChains: [polygon],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <FundWalletProvider>
            <ToastProvider>{children}</ToastProvider>
          </FundWalletProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
