"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRef } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { polygon } from "@/lib/viemChains";

import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/ConnectButton";
import {
  getEscrowAddress,
  getEscrowV2Address,
  getEscrowV3Address,
} from "@/lib/chains";

/**
 * Requires a signed-in Privy account on Polygon mainnet + deployed contracts.
 *
 * Once the requirements have been satisfied and the children rendered, they are
 * NEVER unmounted again — only hidden behind the guard card. Privy/wagmi
 * briefly flicker `ready`/`address` when the user switches tabs, and
 * unmounting the create forms on every flicker destroyed all their in-progress
 * input.
 */
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
  // True once the user has fully passed the guard at least once this mount.
  const everSatisfied = useRef(false);

  let blocker: React.ReactNode = null;

  // Treat `!ready` (Privy re-initialising, e.g. after a tab switch) and a
  // transiently missing wagmi address as flickers once we were already in —
  // only a definitive signed-out state brings the sign-in card back.
  const needsSignIn = everSatisfied.current
    ? ready && !authenticated
    : !ready || !authenticated || !address;

  if (needsSignIn) {
    blocker = (
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
  } else if (chainId !== polygon.id) {
    blocker = (
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
  } else if (requirement === "escrow") {
    const escrow =
      getEscrowV3Address() ?? getEscrowV2Address() ?? getEscrowAddress();
    if (!escrow) {
      blocker = (
        <div className="card p-8 space-y-2">
          <h2 className="text-lg font-semibold">Escrow not configured</h2>
          <p className="text-sm text-muted-foreground">
            Set <code>NEXT_PUBLIC_ESCROW_V3_ADDRESS_POLYGON</code> to your
            deployed SidebetEscrowV3 contract on Polygon mainnet, then redeploy
            the app.
          </p>
        </div>
      );
    }
  }

  if (!blocker) {
    everSatisfied.current = true;
  }

  // Before the first successful pass there is nothing worth preserving, so the
  // guard card can render alone. Afterwards keep the children mounted (hidden)
  // so transient auth/chain flickers can't wipe in-progress form state.
  if (blocker && !everSatisfied.current) {
    return <>{blocker}</>;
  }

  return (
    <>
      {blocker}
      <div className={blocker ? "hidden" : undefined}>{children}</div>
    </>
  );
}
