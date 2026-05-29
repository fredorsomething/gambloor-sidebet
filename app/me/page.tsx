"use client";

import Link from "next/link";
import { useAccount } from "wagmi";

import { BetList } from "@/components/BetList";
import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/ConnectButton";

export default function MyBetsPage() {
  const { address, isConnected } = useAccount();

  if (!isConnected || !address) {
    return (
      <div className="card p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold">My bets</h1>
        <p className="text-sm text-muted-foreground">
          Connect your wallet to see bets you proposed, accepted, or were named
          as settler for.
        </p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My bets</h1>
          <p className="text-sm text-muted-foreground">
            Bets you proposed or accepted.
          </p>
        </div>
        <Button asChild>
          <Link href="/bets/new">Propose a bet</Link>
        </Button>
      </div>

      <Section title="Proposed by me">
        <BetList
          who={address}
          role="proposer"
          defaultStatus="Open"
          emptyState={
            <div className="card p-6 text-sm text-muted-foreground text-center">
              You haven't proposed any bets yet.
            </div>
          }
        />
      </Section>

      <Section title="Accepted by me">
        <BetList
          who={address}
          role="acceptor"
          defaultStatus="Matched"
          emptyState={
            <div className="card p-6 text-sm text-muted-foreground text-center">
              You haven't taken the other side of any bets yet.
            </div>
          }
        />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
