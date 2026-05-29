"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { polygon } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/ConnectButton";
import { getEscrowAddress, getEscrowV2Address } from "@/lib/chains";

/** Requires a signed-in Privy account on Polygon mainnet + deployed contracts. */
export function ChainGuard({
  children,
  require: requirement = "escrow",
}: {
  children: React.ReactNode;
  require?: "escrow" | "market";
}) {
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (!ready || !authenticated || !address) {
    return (
      <div className="card p-8 text-center space-y-4">
        <h2 className="text-lg font-semibold">Sign in to continue</h2>
        <p className="text-sm text-muted-foreground">
          Sidebet runs on Polygon mainnet. Sign in with email, phone, Google, or
          a wallet — we&apos;ll set up a wallet for you automatically.
        </p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (chainId !== polygon.id) {
    return (
      <div className="card p-8 text-center space-y-4">
        <h2 className="text-lg font-semibold">Switch to Polygon</h2>
        <p className="text-sm text-muted-foreground">
          Sidebet only runs on Polygon mainnet (chain id 137). Your wallet is on
          a different network.
        </p>
        <div className="flex justify-center">
          <Button
            disabled={isPending}
            onClick={() => switchChain({ chainId: polygon.id })}
          >
            {isPending ? "Switching…" : "Switch to Polygon"}
          </Button>
        </div>
      </div>
    );
  }

  // Markets are fully off-chain (custodial engine + ledger); a signed-in account
  // on Polygon is all that's needed.
  if (requirement === "market") {
    return <>{children}</>;
  }

  const escrow = getEscrowV2Address() ?? getEscrowAddress();
  if (!escrow) {
    return (
      <div className="card p-8 space-y-2">
        <h2 className="text-lg font-semibold">Escrow not configured</h2>
        <p className="text-sm text-muted-foreground">
          Set <code>NEXT_PUBLIC_ESCROW_V2_ADDRESS_POLYGON</code> to your deployed
          SidebetEscrowV2 contract on Polygon mainnet, then redeploy the app.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
