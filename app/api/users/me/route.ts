import { NextRequest } from "next/server";
import { getAddress } from "viem";

import { resolveDisplayBadges } from "@/lib/badges";
import { verifyPrivySession } from "@/lib/auth";
import { getAuthenticatedProfile } from "@/lib/userProfile";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/users/me — profile for the signed-in Privy user. */
export async function GET(req: NextRequest) {
  const session = await verifyPrivySession(req);
  if (!session.ok) return jsonErr(session.error, session.status);

  try {
    const user = await getAuthenticatedProfile({
      privyId: session.userId,
      activeAddress: session.profileAddress,
      email: session.email,
      linkedAddresses: session.linkedAddresses,
    });

    return jsonOk({
      address: getAddress(session.profileAddress),
      username: user?.username ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      bio: user?.bio ?? null,
      twitter: user?.twitter ?? null,
      discord: user?.discord ?? null,
      verified: user?.verified ?? false,
      badges: resolveDisplayBadges(user?.badges, session.profileAddress),
    });
  } catch (err) {
    console.error("GET /api/users/me failed", session.profileAddress, err);
    return jsonErr("failed to load profile", 500);
  }
}
