import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { shortAddr } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Deterministic conversation key independent of message direction. */
function pairKey(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join("|");
}

/** Resolve a `{ lowercaseAddress -> username }` map for the given addresses. */
async function usernameMap(
  addresses: string[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(addresses.map((a) => a.toLowerCase())));
  if (unique.length === 0) return {};
  const users = await prisma.user.findMany({
    where: { OR: unique.map((a) => ({ address: { equals: a, mode: "insensitive" as const } })) },
    select: { address: true, username: true },
  });
  const map: Record<string, string> = {};
  for (const u of users) {
    if (u.username) map[u.address.toLowerCase()] = u.username;
  }
  return map;
}

/**
 * GET /api/messages?me=0x..            -> conversation list for `me`
 * GET /api/messages?me=0x..&with=0x..  -> thread between `me` and `with`
 *
 * Reading is authenticated: a user can only read their own conversations.
 */
export async function GET(req: NextRequest) {
  const meParam = req.nextUrl.searchParams.get("me") ?? "";
  const withParam = req.nextUrl.searchParams.get("with");

  if (!isAddress(meParam)) return jsonErr("bad address", 400);
  const auth = await verifyWalletAuth({ req, address: meParam });
  if (!auth.ok) return jsonErr(auth.error, auth.status);
  const me = auth.address.toLowerCase();

  // ---- Single thread ----
  if (withParam) {
    if (!isAddress(withParam)) return jsonErr("bad counterparty", 400);
    const other = getAddress(withParam).toLowerCase();
    const pair = pairKey(me, other);

    const rows = await prisma.directMessage.findMany({
      where: { pair },
      orderBy: { createdAt: "asc" },
      take: 500,
    });

    // Mark inbound messages as read.
    await prisma.directMessage.updateMany({
      where: { pair, recipient: me, readAt: null },
      data: { readAt: new Date() },
    });

    const names = await usernameMap([other]);
    return jsonOk({
      counterparty: { address: other, username: names[other] ?? null },
      messages: rows.map((m) => ({
        id: m.id,
        body: m.body,
        sender: m.sender,
        recipient: m.recipient,
        createdAt: m.createdAt.toISOString(),
        mine: m.sender === me,
      })),
    });
  }

  // ---- Conversation list ----
  const recent = await prisma.directMessage.findMany({
    where: { OR: [{ sender: me }, { recipient: me }] },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const byPair = new Map<
    string,
    {
      address: string;
      lastBody: string;
      lastAt: Date;
      fromMe: boolean;
      unread: number;
    }
  >();
  for (const m of recent) {
    const other = m.sender === me ? m.recipient : m.sender;
    const existing = byPair.get(m.pair);
    const isUnread = m.recipient === me && m.readAt == null;
    if (!existing) {
      byPair.set(m.pair, {
        address: other,
        lastBody: m.body,
        lastAt: m.createdAt,
        fromMe: m.sender === me,
        unread: isUnread ? 1 : 0,
      });
    } else if (isUnread) {
      existing.unread += 1;
    }
  }

  const conversations = Array.from(byPair.values()).sort(
    (a, b) => b.lastAt.getTime() - a.lastAt.getTime(),
  );
  const names = await usernameMap(conversations.map((c) => c.address));

  return jsonOk({
    conversations: conversations.map((c) => ({
      address: c.address,
      username: names[c.address] ?? null,
      lastBody: c.lastBody,
      lastAt: c.lastAt.toISOString(),
      fromMe: c.fromMe,
      unread: c.unread,
    })),
  });
}

const PostSchema = z.object({
  from: z.string(),
  to: z.string(),
  body: z.string().trim().min(1).max(2000),
});

/** POST /api/messages — send a direct message. */
export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonErr("invalid body", 400);
  }
  const parsed = PostSchema.safeParse(json);
  if (!parsed.success) return jsonErr("invalid message", 400);

  const { from, to, body } = parsed.data;
  if (!isAddress(from) || !isAddress(to)) return jsonErr("bad address", 400);

  const auth = await verifyWalletAuth({ req, address: from });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const sender = auth.address.toLowerCase();
  const recipient = getAddress(to).toLowerCase();
  if (sender === recipient) return jsonErr("cannot message yourself", 400);

  const msg = await prisma.directMessage.create({
    data: { pair: pairKey(sender, recipient), sender, recipient, body },
  });

  const names = await usernameMap([sender]);
  const senderName = names[sender] ?? shortAddr(sender);
  await notify({
    recipient,
    type: "status",
    title: `New message from ${senderName}`,
    body: body.slice(0, 120),
    link: `/messages?with=${sender}`,
  });

  return jsonOk({
    message: {
      id: msg.id,
      body: msg.body,
      sender: msg.sender,
      recipient: msg.recipient,
      createdAt: msg.createdAt.toISOString(),
      mine: true,
    },
  });
}
