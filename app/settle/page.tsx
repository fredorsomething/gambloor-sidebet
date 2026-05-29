"use client";

import { useAccount } from "wagmi";

import { BetList } from "@/components/BetList";
import { ConnectButton } from "@/components/ConnectButton";

export default function SettleDashboardPage() {
  const { address, isConnected } = useAccount();

  if (!isConnected || !address) {
    return (
      <div className="card p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold">Settler dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Connect the wallet that was named as the settler on a market to
          resolve it.
        </p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Settler dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Bets where you were named as the trusted settler. Pick the winner — or
          declare a push — once the outcome is known.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Awaiting your decision</h2>
        <BetList
          who={address}
          role="settler"
          defaultStatus="Matched"
          emptyState={
            <div className="card p-6 text-sm text-muted-foreground text-center">
              Nothing to settle right now.
            </div>
          }
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Open markets you'll settle</h2>
        <BetList
          who={address}
          role="settler"
          defaultStatus="Open"
          emptyState={
            <div className="card p-6 text-sm text-muted-foreground text-center">
              No open markets are waiting on you.
            </div>
          }
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Resolved</h2>
        <BetList
          who={address}
          role="settler"
          defaultStatus="Settled"
          emptyState={
            <div className="card p-6 text-sm text-muted-foreground text-center">
              You haven't settled any markets yet.
            </div>
          }
        />
      </section>
    </div>
  );
}
