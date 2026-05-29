import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const Schema = z.object({
  address: z.string().refine(isAddress, "bad address"),
  /** Specific ids to mark read; when omitted, all of the caller's are marked. */
  ids: z.array(z.number().int().positive()).optional(),
});

/** POST /api/notifications/read — mark notifications read for the caller. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const address = getAddress(parsed.data.address);

  const auth = await verifyWalletAuth({ req, address });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const recipient = address.toLowerCase();
  await prisma.notification.updateMany({
    where: {
      recipient,
      read: false,
      ...(parsed.data.ids ? { id: { in: parsed.data.ids } } : {}),
    },
    data: { read: true },
  });

  const unread = await prisma.notification.count({
    where: { recipient, read: false },
  });
  return jsonOk({ unread });
}
