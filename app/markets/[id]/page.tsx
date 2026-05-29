import Link from "next/link";

import { MarketDetail } from "@/components/markets/MarketDetail";

export default function MarketDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/markets"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← All markets
        </Link>
      </div>
      <MarketDetail id={id} />
    </div>
  );
}
