import Link from "next/link";

import { BetList } from "@/components/BetList";
import { Button } from "@/components/ui/button";

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
              <Link href="/markets">Browse markets</Link>
            </Button>
          </div>
        </div>
      </section>

      <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">
        Need POL, pUSD, USDC or USDC.e? Get it easily with our trusted partner,{" "}
        <a
          href="https://bigswappa.fun/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          BigSwappa
        </a>
      </p>

      <section id="open" className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-semibold">Open sidebets</h2>
            <p className="text-sm text-muted-foreground">
              Recent and open 1v1 sidebets across Polygon.
            </p>
          </div>
        </div>
        <BetList defaultStatus="Open" />
      </section>
    </div>
  );
}
