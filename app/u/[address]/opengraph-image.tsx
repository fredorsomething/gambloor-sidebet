import { notFound } from "next/navigation";

import { renderOgCard } from "@/lib/og/buildImage";
import { loadRemoteImageDataUrl } from "@/lib/og/loadThumb";
import { resolveLinkPreview } from "@/lib/linkPreview";
import { absoluteUrl } from "@/lib/siteUrl";

export const runtime = "nodejs";
export const alt = "Sidebet profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: { address: string };
}) {
  const handle = decodeURIComponent(params.address).replace(/^@/, "");
  const preview = await resolveLinkPreview(`/u/${handle}`);
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
    console.error("profile opengraph-image render failed", handle, err);
    return renderOgCard(preview, { thumbDataUrl: null });
  }
}
