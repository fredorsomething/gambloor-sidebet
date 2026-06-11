import Link from "next/link";
import type { Metadata } from "next";

import { MarketDetail } from "@/components/markets/MarketDetail";
import { buildMetadataForPath } from "@/lib/og/metadata";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  return buildMetadataForPath(`/markets/${params.id}`);
}

export default function MarketDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          href="/home"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to feed
        </Link>
      </div>
      <MarketDetail id={id} />
    </div>
  );
}
