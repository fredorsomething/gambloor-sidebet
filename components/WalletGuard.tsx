"use client";

import { useAccount } from "wagmi";

import { ConnectButton } from "@/components/ConnectButton";

/** Requires only a connected wallet — no chain or escrow checks. */
export function WalletGuard({
  children,
  title = "Connect a wallet to continue",
  description = "Connect your wallet to sign in. This does not cost gas.",
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="card p-8 text-center space-y-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
