"use client";

import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { polygon, polygonAmoy } from "wagmi/chains";

import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/ConnectButton";
import { getEscrowAddress } from "@/lib/chains";

const SUPPORTED_IDS = [polygon.id, polygonAmoy.id];

/** Wraps children, prompting the user to connect / switch network as needed. */
export function ChainGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected) {
    return (
      <div className="card p-8 text-center space-y-4">
        <h2 className="text-lg font-semibold">Connect a wallet to continue</h2>
        <p className="text-sm text-muted-foreground">
          Sidebet uses your wallet to sign the escrow transactions. We never
          take custody of funds.
        </p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (!SUPPORTED_IDS.includes(chainId as 137 | 80002)) {
    return (
      <div className="card p-8 text-center space-y-4">
        <h2 className="text-lg font-semibold">Unsupported network</h2>
        <p className="text-sm text-muted-foreground">
          Sidebet runs on Polygon (mainnet) and Polygon Amoy (testnet).
        </p>
        <div className="flex justify-center gap-2">
          <Button
            disabled={isPending}
            onClick={() => switchChain({ chainId: polygonAmoy.id })}
            variant="outline"
          >
            Switch to Amoy
          </Button>
          <Button
            disabled={isPending}
            onClick={() => switchChain({ chainId: polygon.id })}
          >
            Switch to Polygon
          </Button>
        </div>
      </div>
    );
  }

  const escrow = getEscrowAddress(chainId);
  if (!escrow) {
    return (
      <div className="card p-8 space-y-2">
        <h2 className="text-lg font-semibold">Escrow not configured</h2>
        <p className="text-sm text-muted-foreground">
          No SidebetEscrow address is configured for chain id{" "}
          <span className="font-mono">{chainId}</span>. Deploy the contract and
          set <code>NEXT_PUBLIC_ESCROW_ADDRESS_POLYGON</code> or{" "}
          <code>NEXT_PUBLIC_ESCROW_ADDRESS_AMOY</code> in your environment.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
