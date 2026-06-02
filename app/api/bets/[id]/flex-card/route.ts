import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import { resolveLinkPreview } from "@/lib/linkPreview";
import { renderOgCard } from "@/lib/og/buildImage";
import { loadRemoteImageDataUrl } from "@/lib/og/loadThumb";
import { absoluteUrl } from "@/lib/siteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function avatarDataUrl(url: string | null | undefined) {
  if (!url) return null;
  return loadRemoteImageDataUrl(
    url.startsWith("http") ? url : absoluteUrl(url),
  );
}

/** GET /api/bets/[id]/flex-card?address=0x… — downloadable PNG result card. */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return new Response("bad id", { status: 400 });
  }

  const addressRaw = req.nextUrl.searchParams.get("address") ?? "";
  if (!isAddress(addressRaw)) {
    return new Response("bad address", { status: 400 });
  }
  const address = getAddress(addressRaw).toLowerCase();

  const preview = await resolveLinkPreview(`/bets/${params.id}`);
  if (!preview || preview.kind !== "bet") {
    return new Response("not found", { status: 404 });
  }

  if (preview.status !== "Settled" && preview.status !== "Refunded") {
    return new Response("not settled", { status: 404 });
  }

  const proposer = preview.betMatchup?.proposer.address?.toLowerCase();
  const acceptor = preview.betMatchup?.acceptor.address?.toLowerCase();
  if (address !== proposer && address !== acceptor) {
    return new Response("not a participant", { status: 404 });
  }

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
    console.error("bet flex-card render failed", id, err);
    return renderOgCard(preview, {
      thumbDataUrl: null,
      partyAvatars: { proposer: null, acceptor: null },
    });
  }
}
