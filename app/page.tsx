import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Feed } from "@/components/Feed";
import { Button } from "@/components/ui/button";
import { TokenIcon } from "@/components/ui/TokenIcon";

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
              Peer-to-peer sidebets and public CLOB markets on Polygon. Pick a
              side, stake, and let a trusted settler call it.
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
        className="group relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-[hsl(222_47%_13%)] via-card to-[hsl(222_47%_13%)] p-5 transition-all hover:border-primary/50 hover:shadow-lg sm:flex-row sm:justify-between md:p-6"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="flex items-center gap-4">
          <div className="flex -space-x-2.5">
            <TokenBadge symbol="POL" />
            <TokenBadge symbol="USDC" />
            <TokenBadge symbol="USDC.e" />
            <TokenBadge symbol="pUSD" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight md:text-xl">
              Need tokens to bet?
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Swap POL, USDC, USDC.e &amp; pUSD instantly — right here on
              Polygon.
            </p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-transform group-hover:translate-x-0.5">
          Swap now
          <ArrowRight className="h-4 w-4" />
        </span>
      </Link>

      <section id="markets" className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-semibold">Markets</h2>
            <p className="text-sm text-muted-foreground">
              Sidebets and prediction markets — open, live, and settled.
            </p>
          </div>
        </div>
        <Feed />
      </section>
    </div>
  );
}

function TokenBadge({ symbol }: { symbol: string }) {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-card bg-muted ring-1 ring-border">
      <TokenIcon symbol={symbol} size={26} />
    </span>
  );
}
