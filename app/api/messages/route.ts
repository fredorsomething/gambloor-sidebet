import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { isAllowedGifUrl } from "@/lib/commentInteractions";
import { prisma } from "@/lib/db";
import {
  blockedByUser,
  isDmBlocked,
  usersWhoBlocked,
} from "@/lib/dmBlocks";
import { notify } from "@/lib/notifications";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { shortAddr } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Deterministic conversation key independent of message direction. */
function pairKey(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join("|");
}

type PublicProfile = {
  username: string | null;
  avatarUrl: string | null;
};

/** Resolve profiles (username + avatar) for wallet addresses. */
async function profileMap(
  addresses: string[],
): Promise<Record<string, PublicProfile>> {
  const unique = Array.from(new Set(addresses.map((a) => a.toLowerCase())));
  if (unique.length === 0) return {};

  const users = await prisma.user.findMany({
    where: {
      OR: unique.map((a) => ({
        address: { equals: a, mode: "insensitive" as const },
      })),
    },
    select: { address: true, username: true, avatarUrl: true },
  });

  const map: Record<string, PublicProfile> = {};
  for (const u of users) {
    map[u.address.toLowerCase()] = {
      username: u.username,
      avatarUrl: u.avatarUrl,
    };
  }
  return map;
}

function previewBody(body: string, gifUrl: string | null): string {
  if (body.trim()) return body;
  if (gifUrl) return "GIF";
  return "";
}

/**
 * GET /api/messages?me=0x..            -> conversation list for `me`
 * GET /api/messages?me=0x..&with=0x..  -> thread between `me` and `with`
 */
export async function GET(req: NextRequest) {
  const meParam = req.nextUrl.searchParams.get("me") ?? "";
  const withParam = req.nextUrl.searchParams.get("with");

  if (!isAddress(meParam)) return jsonErr("bad address", 400);
  const auth = await verifyWalletAuth({ req, address: meParam });
  if (!auth.ok) return jsonErr(auth.error, auth.status);
  const me = auth.address.toLowerCase();

  const [iBlocked, blockedMe] = await Promise.all([
    blockedByUser(me),
    usersWhoBlocked(me),
  ]);
  const isHidden = (addr: string) =>
    iBlocked.has(addr) || blockedMe.has(addr);

  // ---- Single thread ----
  if (withParam) {
    if (!isAddress(withParam)) return jsonErr("bad counterparty", 400);
    const other = getAddress(withParam).toLowerCase();
    if (isHidden(other)) {
      return jsonErr("You cannot view this conversation", 403);
    }

    const pair = pairKey(me, other);
    const rows = await prisma.directMessage.findMany({
      where: { pair },
      orderBy: { createdAt: "asc" },
      take: 500,
    });

    await prisma.directMessage.updateMany({
      where: { pair, recipient: me, readAt: null },
      data: { readAt: new Date() },
    });

    const profiles = await profileMap([other, me]);
    const blocked = await prisma.dmBlock.findUnique({
      where: { blocker_blocked: { blocker: me, blocked: other } },
    });

    return jsonOk({
      counterparty: {
        address: other,
        username: profiles[other]?.username ?? null,
        avatarUrl: profiles[other]?.avatarUrl ?? null,
      },
      blocked: !!blocked,
      messages: rows.map((m) => ({
        id: m.id,
        body: m.body,
        gifUrl: m.gifUrl,
        sender: m.sender,
        recipient: m.recipient,
        senderAvatarUrl: profiles[m.sender]?.avatarUrl ?? null,
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
    if (isHidden(other)) continue;

    const existing = byPair.get(m.pair);
    const isUnread = m.recipient === me && m.readAt == null;
    if (!existing) {
      byPair.set(m.pair, {
        address: other,
        lastBody: previewBody(m.body, m.gifUrl),
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
  const profiles = await profileMap(conversations.map((c) => c.address));

  return jsonOk({
    conversations: conversations.map((c) => ({
      address: c.address,
      username: profiles[c.address]?.username ?? null,
      avatarUrl: profiles[c.address]?.avatarUrl ?? null,
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
  body: z.string().trim().max(2000).optional().default(""),
  gifUrl: z.string().url().max(600).nullable().optional(),
});

/** POST /api/messages — send a direct message (text and/or GIF). */
export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonErr("invalid body", 400);
  }
  const parsed = PostSchema.safeParse(json);
  if (!parsed.success) return jsonErr("invalid message", 400);

  const { from, to, body, gifUrl } = parsed.data;
  if (!isAddress(from) || !isAddress(to)) return jsonErr("bad address", 400);

  const auth = await verifyWalletAuth({ req, address: from });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const sender = auth.address.toLowerCase();
  const recipient = getAddress(to).toLowerCase();
  if (sender === recipient) return jsonErr("cannot message yourself", 400);

  if (await isDmBlocked(sender, recipient)) {
    return jsonErr("You cannot message this user", 403);
  }

  const text = body ?? "";
  const gif = gifUrl ?? null;
  if (!text && !gif) return jsonErr("message cannot be empty", 400);
  if (gif && !isAllowedGifUrl(gif)) return jsonErr("invalid gif url", 400);

  const msg = await prisma.directMessage.create({
    data: {
      pair: pairKey(sender, recipient),
      sender,
      recipient,
      body: text,
      gifUrl: gif,
    },
  });

  const profiles = await profileMap([sender]);
  const senderName = profiles[sender]?.username ?? shortAddr(sender);
  const notifyBody = text || "Sent you a GIF";
  await notify({
    recipient,
    type: "status",
    title: `New message from ${senderName}`,
    body: notifyBody.slice(0, 120),
    link: `/messages?with=${sender}`,
  });

  return jsonOk({
    message: {
      id: msg.id,
      body: msg.body,
      gifUrl: msg.gifUrl,
      sender: msg.sender,
      recipient: msg.recipient,
      createdAt: msg.createdAt.toISOString(),
      mine: true,
    },
  });
}
