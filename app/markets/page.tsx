import Link from "next/link";

import { MarketList } from "@/components/markets/MarketList";
import { Button } from "@/components/ui/button";

export default function MarketsPage() {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(265_85%_45%)] to-[hsl(222_89%_45%)] p-8 text-white md:p-10">
        <div className="relative max-w-2xl">
          <p className="mb-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            CLOB · ERC-1155 shares · Polygon
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Trade outcome shares on open markets.
          </h1>
          <p className="mt-3 text-white/85">
            Public prediction markets with a signed order book. Buy and sell
            shares of any outcome; settle on-chain when the market resolves.
          </p>
          <div className="mt-6">
            <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90">
              <Link href="/markets/new">Create a market</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Open markets</h2>
          <p className="text-sm text-muted-foreground">
            Live CLOB prediction markets.
          </p>
        </div>
        <MarketList defaultStatus="Open" />
      </section>
    </div>
  );
}
