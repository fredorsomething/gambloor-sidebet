import { notFound } from "next/navigation";

import { renderOgCard } from "@/lib/og/buildImage";
import { loadRemoteImageDataUrl } from "@/lib/og/loadThumb";
import { resolveLinkPreview } from "@/lib/linkPreview";
import { absoluteUrl } from "@/lib/siteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Sidebet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function avatarDataUrl(url: string | null | undefined) {
  if (!url) return null;
  return loadRemoteImageDataUrl(
    url.startsWith("http") ? url : absoluteUrl(url),
  );
}

export default async function Image({
  params,
}: {
  params: { id: string };
}) {
  const preview = await resolveLinkPreview(`/bets/${params.id}`);
  if (!preview) notFound();

  const [thumbDataUrl, proposerAvatar, acceptorAvatar] = await Promise.all([
    preview.imageUrl
      ? loadRemoteImageDataUrl(
          preview.imageUrl.startsWith("http")
            ? preview.imageUrl
            : absoluteUrl(preview.imageUrl),
        )
      : Promise.resolve(null),
    avatarDataUrl(preview.betMatchup?.proposer.avatarUrl),
    avatarDataUrl(preview.betMatchup?.acceptor.avatarUrl),
  ]);

  try {
    return renderOgCard(preview, {
      thumbDataUrl,
      partyAvatars: { proposer: proposerAvatar, acceptor: acceptorAvatar },
    });
  } catch (err) {
    console.error("bet opengraph-image render failed", params.id, err);
    return renderOgCard(preview, {
      thumbDataUrl: null,
      partyAvatars: { proposer: null, acceptor: null },
    });
  }
}
