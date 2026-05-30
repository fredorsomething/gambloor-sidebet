import type { Metadata } from "next";

import { buildMetadataForPath } from "@/lib/og/metadata";

export async function generateMetadata({
  params,
}: {
  params: { address: string };
}): Promise<Metadata> {
  const handle = decodeURIComponent(params.address).replace(/^@/, "");
  return buildMetadataForPath(`/u/${handle}`);
}

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
