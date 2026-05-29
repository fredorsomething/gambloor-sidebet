import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications?address=0x..
 * Returns the caller's recent notifications + unread count. Requires the Privy
 * bearer token for that address so notifications stay private.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("address") ?? "";
  if (!isAddress(raw)) return jsonErr("bad address", 400);
  const address = getAddress(raw);

  const auth = await verifyWalletAuth({ req, address });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const recipient = address.toLowerCase();
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { recipient },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({ where: { recipient, read: false } }),
  ]);

  return jsonOk({ items, unread });
}

const PostSchema = z.object({
  address: z.string().refine(isAddress, "bad address"),
  type: z.enum(["deposit", "withdrawal"]),
  title: z.string().min(1).max(120),
  body: z.string().max(280).optional(),
  link: z.string().max(200).optional(),
});

/**
 * POST /api/notifications — record a self-notification for wallet activity
 * (deposit / withdrawal). The caller can only create notifications for itself.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const d = parsed.data;
  const address = getAddress(d.address);

  const auth = await verifyWalletAuth({ req, address });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  await notify({
    recipient: address.toLowerCase(),
    type: d.type,
    title: d.title,
    body: d.body,
    link: d.link,
  });

  return jsonOk({ ok: true });
}
