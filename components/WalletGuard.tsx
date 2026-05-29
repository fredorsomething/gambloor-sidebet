"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

import { ConnectButton } from "@/components/ConnectButton";

/** Requires a signed-in Privy account with an active wallet — no chain checks. */
export function WalletGuard({
  children,
  title = "Sign in to continue",
  description = "Sign in with email, phone, Google, or a wallet to get started.",
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();

  if (ready && authenticated && address) {
    return <>{children}</>;
  }

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
