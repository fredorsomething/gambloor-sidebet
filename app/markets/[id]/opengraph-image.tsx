import { notFound } from "next/navigation";

import { renderOgCard } from "@/lib/og/buildImage";
import { loadRemoteImageDataUrl } from "@/lib/og/loadThumb";
import { resolveLinkPreview } from "@/lib/linkPreview";
import { absoluteUrl } from "@/lib/siteUrl";

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

  const thumbDataUrl = preview.imageUrl
    ? await loadRemoteImageDataUrl(
        preview.imageUrl.startsWith("http")
          ? preview.imageUrl
          : absoluteUrl(preview.imageUrl),
      )
    : null;

  try {
    return renderOgCard(preview, { thumbDataUrl });
  } catch (err) {
    console.error("market opengraph-image render failed", params.id, err);
    return renderOgCard(preview, { thumbDataUrl: null });
  }
}
