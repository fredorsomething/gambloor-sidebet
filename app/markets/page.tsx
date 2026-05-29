import Link from "next/link";

import { MarketList } from "@/components/markets/MarketList";
import { Button } from "@/components/ui/button";

export default function MarketsPage() {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[hsl(265_85%_45%)] to-[hsl(222_89%_45%)] p-5 text-white md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              Trade outcome shares on open markets.
            </h1>
            <p className="mt-1 text-sm text-white/85">
              Public prediction markets with a signed order book. Buy and sell
              shares of any outcome; settle on-chain at resolution.
            </p>
          </div>
          <div className="shrink-0">
            <Button asChild className="bg-white text-primary hover:bg-white/90">
              <Link href="/create?type=market">Create a market</Link>
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
