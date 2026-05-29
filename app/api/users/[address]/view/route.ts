import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import { jsonErr, jsonOk } from "@/lib/serialize";
import { getProfileViewCount, recordProfileView } from "@/lib/profileViews";

export const dynamic = "force-dynamic";

const ANON_RE = /^anon:[a-zA-Z0-9_-]{6,64}$/;

/** GET — current view count for a profile. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } },
) {
  const handle = decodeURIComponent(params.address).trim().replace(/^@/, "");
  if (!isAddress(handle)) return jsonErr("bad address", 400);
  const count = await getProfileViewCount(getAddress(handle));
  return jsonOk({ views: count });
}

/**
 * POST — record a profile view. Body: { viewer?: string }. `viewer` may be a
 * wallet address (signed-in) or an "anon:<id>" key (signed-out). This is an
 * unauthenticated, low-trust counter; we only dedupe by viewer key.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { address: string } },
) {
  const handle = decodeURIComponent(params.address).trim().replace(/^@/, "");
  if (!isAddress(handle)) return jsonErr("bad address", 400);
  const target = getAddress(handle);

  let body: { viewer?: unknown } = {};
  try {
    body = (await req.json()) as { viewer?: unknown };
  } catch {
    // empty body allowed
  }

  let viewer: string | null = null;
  if (typeof body.viewer === "string") {
    if (isAddress(body.viewer)) viewer = getAddress(body.viewer);
    else if (ANON_RE.test(body.viewer)) viewer = body.viewer;
  }
  if (!viewer) return jsonErr("bad viewer", 400);

  const views = await recordProfileView(target, viewer);
  return jsonOk({ views });
}
