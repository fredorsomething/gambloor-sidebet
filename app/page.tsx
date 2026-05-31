import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Feed } from "@/components/Feed";
import { DiscordWidget } from "@/components/DiscordWidget";
import { Button } from "@/components/ui/button";
import { TokenIcon, TokenSymbol } from "@/components/ui/TokenIcon";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-[hsl(222_89%_45%)] p-5 text-primary-foreground md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              Settle any argument on-chain.
            </h1>
            <p className="mt-1 text-sm text-primary-foreground/85">
              Peer-to-peer sidebets on Polygon with 0% fees. Pick a
              side, stake, and agree on the outcome with your counterparty. If you can't agree, let a trusted settler call it.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              asChild
              className="bg-white text-primary hover:bg-white/90"
            >
              <Link href="/create">Create a bet</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10"
            >
              <Link href="#markets">Browse markets</Link>
            </Button>
          </div>
        </div>
      </section>

      <Link
        href="/swap"
        className="group flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40 sm:gap-4 sm:p-4"
      >
        <div className="flex -space-x-2 shrink-0">
          <TokenBadge symbol="POL" />
          <TokenBadge symbol="USDC" />
          <TokenBadge symbol="USDC.e" />
          <TokenBadge symbol="pUSD" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight sm:text-base">
            Need tokens to bet?
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            Swap POL, USDC, USDC.e &amp; pUSD directly on sidebet.lol, straight to your
            wallet.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-transform group-hover:translate-x-0.5 sm:text-sm">
          Swap now
          <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </span>
      </Link>

      <section id="markets" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">Markets</h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs text-muted-foreground">
                All sidebets in <TokenSymbol symbol="USDC.e" size={14} />
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Find a sidebet here. Can&apos;t find one? Create your own.
            </p>
          </div>
          <DiscordWidget />
        </div>
        <Feed />
      </section>
    </div>
  );
}

function TokenBadge({ symbol }: { symbol: string }) {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-muted ring-1 ring-border">
      <TokenIcon symbol={symbol} size={20} />
    </span>
  );
}
