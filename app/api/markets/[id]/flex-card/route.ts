import { NextRequest } from "next/server";
import { isAddress } from "viem";

import { renderMarketFlexCard } from "@/lib/og/buildImage";
import { loadRemoteImageDataUrl } from "@/lib/og/loadThumb";
import { resolveMarketFlexCard } from "@/lib/marketFlexCardData";
import { absoluteUrl } from "@/lib/siteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/markets/[id]/flex-card?address=0x… — downloadable PNG result card. */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return new Response("bad id", { status: 400 });
  }

  const address = req.nextUrl.searchParams.get("address") ?? "";
  if (!isAddress(address)) {
    return new Response("bad address", { status: 400 });
  }

  const data = await resolveMarketFlexCard(id, address);
  if (!data) {
    return new Response("not found", { status: 404 });
  }

  const viewerSide = data.sides.find((s) => s.isViewer);
  const viewerAvatarUrl = viewerSide?.avatarUrl;

  const [thumbDataUrl, viewerAvatar] = await Promise.all([
    data.imageUrl
      ? loadRemoteImageDataUrl(
          data.imageUrl.startsWith("http")
            ? data.imageUrl
            : absoluteUrl(data.imageUrl),
        )
      : Promise.resolve(null),
    viewerAvatarUrl
      ? loadRemoteImageDataUrl(
          viewerAvatarUrl.startsWith("http")
            ? viewerAvatarUrl
            : absoluteUrl(viewerAvatarUrl),
        )
      : Promise.resolve(null),
  ]);

  try {
    return renderMarketFlexCard(data, { thumbDataUrl, viewerAvatar });
  } catch (err) {
    console.error("market flex-card render failed", id, err);
    return renderMarketFlexCard(data, {
      thumbDataUrl: null,
      viewerAvatar: null,
    });
  }
}
