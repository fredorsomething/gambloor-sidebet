import Link from "next/link";

import { BetList } from "@/components/BetList";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-[hsl(222_89%_45%)] p-8 text-primary-foreground md:p-12">
        <div className="relative max-w-2xl">
          <p className="mb-4 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            non-custodial · Polygon · USDC + pUSD
          </p>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight md:text-5xl">
            Settle any random argument on-chain.
          </h1>
          <p className="mt-3 max-w-2xl text-primary-foreground/85">
            Sidebet is a peer-to-peer escrow for the bets too weird for
            Polymarket. Write your own terms, lock in stakes, and pick a trusted
            settler to call the result. Funds stay in escrow until the market
            resolves.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              asChild
              size="lg"
              className="bg-white text-primary hover:bg-white/90"
            >
              <Link href="/bets/new">Propose a bet</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10"
            >
              <Link href="/leaderboard">View leaderboard</Link>
            </Button>
          </div>
        </div>
      </section>

      <section id="open" className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-semibold">Markets</h2>
            <p className="text-sm text-muted-foreground">
              Recent and open side bets across Polygon.
            </p>
          </div>
        </div>
        <BetList defaultStatus="Open" />
      </section>
    </div>
  );
}
