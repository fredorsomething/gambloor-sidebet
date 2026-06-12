import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";

import { resolveDisplayBadges } from "@/lib/badges";
import { verifyWalletAuth } from "@/lib/auth";
import { getAuthenticatedProfile } from "@/lib/userProfile";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/users/me?address=0x… — profile for the signed-in Privy user. */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("address")?.trim() ?? "";
  if (!isAddress(raw)) return jsonErr("bad address", 400);

  const auth = await verifyWalletAuth({ req, address: raw });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  try {
    const user = await getAuthenticatedProfile({
      privyId: auth.userId,
      activeAddress: auth.address,
      email: auth.email,
      linkedAddresses: auth.linkedAddresses,
    });

    return jsonOk({
      address: getAddress(auth.address),
      username: user?.username ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      bio: user?.bio ?? null,
      twitter: user?.twitter ?? null,
      discord: user?.discord ?? null,
      verified: user?.verified ?? false,
      badges: resolveDisplayBadges(user?.badges, auth.address),
    });
  } catch (err) {
    console.error("GET /api/users/me failed", raw, err);
    return jsonErr("failed to load profile", 500);
  }
}
