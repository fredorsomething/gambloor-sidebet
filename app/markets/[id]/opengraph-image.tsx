import { notFound } from "next/navigation";

import { renderOgCard } from "@/lib/og/buildImage";
import { resolveLinkPreview } from "@/lib/linkPreview";

export const runtime = "nodejs";
export const alt = "Sidebet market";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: { id: string };
}) {
  const preview = await resolveLinkPreview(`/markets/${params.id}`);
  if (!preview) notFound();
  return renderOgCard(preview);
}
