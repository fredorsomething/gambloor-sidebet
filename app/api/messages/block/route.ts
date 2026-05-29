import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const BlockSchema = z.object({
  blocker: z.string(),
  blocked: z.string(),
});

/** POST /api/messages/block — block a user from DMs. */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonErr("invalid body", 400);
  }
  const parsed = BlockSchema.safeParse(json);
  if (!parsed.success) return jsonErr("invalid request", 400);

  const { blocker, blocked } = parsed.data;
  if (!isAddress(blocker) || !isAddress(blocked)) {
    return jsonErr("bad address", 400);
  }

  const auth = await verifyWalletAuth({ req, address: blocker });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const blockerLc = auth.address.toLowerCase();
  const blockedLc = getAddress(blocked).toLowerCase();
  if (blockerLc === blockedLc) return jsonErr("cannot block yourself", 400);

  await prisma.dmBlock.upsert({
    where: { blocker_blocked: { blocker: blockerLc, blocked: blockedLc } },
    create: { blocker: blockerLc, blocked: blockedLc },
    update: {},
  });

  return jsonOk({ blocked: true });
}

const UnblockSchema = z.object({
  blocker: z.string(),
  blocked: z.string(),
});

/** DELETE /api/messages/block — unblock a user. */
export async function DELETE(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonErr("invalid body", 400);
  }
  const parsed = UnblockSchema.safeParse(json);
  if (!parsed.success) return jsonErr("invalid request", 400);

  const auth = await verifyWalletAuth({ req, address: parsed.data.blocker });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  await prisma.dmBlock.deleteMany({
    where: {
      blocker: auth.address.toLowerCase(),
      blocked: getAddress(parsed.data.blocked).toLowerCase(),
    },
  });

  return jsonOk({ blocked: false });
}
