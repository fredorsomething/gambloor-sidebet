import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";

import { Feed } from "@/components/Feed";
import { DiscordWidget } from "@/components/DiscordWidget";
import { TokenIcon, TokenSymbol } from "@/components/ui/TokenIcon";
import {
  formatPlatformAmount,
  getPlatformStats,
} from "@/lib/platformStats";

export const revalidate = 60;

export default async function HomePage() {
  const { totalVolumeUsd, userCount } = await getPlatformStats();

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-baseline gap-x-8 gap-y-3 sm:gap-x-10">
        <p className="text-base text-muted-foreground">
          Total volume:{" "}
          <span className="inline-flex items-center gap-1.5 text-3xl font-bold tabular-nums text-foreground">
            {formatPlatformAmount(totalVolumeUsd)}
            <TokenIcon symbol="USDC.e" size={28} />
          </span>
        </p>
        <p className="text-base text-muted-foreground">
          Trusted by{" "}
          <span className="text-3xl font-bold tabular-nums text-foreground">
            {userCount.toLocaleString()}
          </span>{" "}
          users
        </p>
        <p className="text-base text-muted-foreground">
          <span className="text-3xl font-bold tabular-nums text-foreground">
            100%
          </span>{" "}
          of bets resolved correctly
        </p>
      </section>

      <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-[hsl(222_89%_45%)] p-5 text-primary-foreground md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-lg">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Bet your friends on-chain.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-primary-foreground/90 md:text-base">
              0% fees on Polygon. Pick a side, lock your stake, share the
              link — and if you can&apos;t agree who won, a trusted settler
              calls it.
            </p>
          </div>
          <Link
            href="/create"
            className="hero-create-btn h-12 shrink-0 gap-2.5 self-center px-8 text-base md:h-14 md:px-10 md:text-lg"
          >
            <span className="relative z-10 inline-flex items-center gap-2.5">
              <Plus className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.5} />
              Create bet
              <TokenIcon symbol="USDC.e" size={22} />
            </span>
          </Link>
        </div>
      </section>

      <Link
        href="/swap"
        className="group flex items-center gap-3 rounded-lg border border-border/80 bg-muted/30 px-4 py-2.5 text-sm transition-colors hover:border-primary/30 hover:bg-muted/50"
      >
        <div className="flex -space-x-2 shrink-0">
          <TokenBadge symbol="POL" />
          <TokenBadge symbol="USDC" />
          <TokenBadge symbol="USDC.e" />
          <TokenBadge symbol="pUSD" />
        </div>
        <p className="min-w-0 flex-1 text-muted-foreground">
          Need gas (POL), or USDC.e to bet?{" "}
          <span className="text-foreground">
            Use our easy, built-in swap.
          </span>
        </p>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary transition-transform group-hover:translate-x-0.5">
          Swap
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Link>

      <section id="markets" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold leading-tight">
              Markets
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-normal text-muted-foreground">
                All sidebets in <TokenSymbol symbol="USDC.e" size={14} />
              </span>
            </h2>
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
