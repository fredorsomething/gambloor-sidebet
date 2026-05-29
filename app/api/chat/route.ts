import { NextRequest } from "next/server";
import { isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { listChatMessages, touchPresence } from "@/lib/chat";
import { chatMuteMessage } from "@/lib/chatMute";
import { isAllowedGifUrl } from "@/lib/commentInteractions";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat?cid=<sessionId>&me=<addr>
 * Returns recent global chat messages + the live online count. The poll doubles
 * as a presence heartbeat for the requesting browser session (`cid`).
 */
export async function GET(req: NextRequest) {
  const cid = (req.nextUrl.searchParams.get("cid") ?? "").slice(0, 64);
  const meParam = req.nextUrl.searchParams.get("me");
  const me = meParam && isAddress(meParam) ? meParam : null;

  const [messages, online] = await Promise.all([
    listChatMessages(200),
    touchPresence(cid, me),
  ]);

  return jsonOk({ messages, online });
}

const PostSchema = z.object({
  from: z.string(),
  body: z.string().trim().max(500).optional().default(""),
  gifUrl: z.string().url().max(600).nullable().optional(),
});

/** POST /api/chat — send a global chat message (auth required). */
export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonErr("invalid body", 400);
  }
  const parsed = PostSchema.safeParse(json);
  if (!parsed.success) return jsonErr("invalid message", 400);

  const { from, body, gifUrl } = parsed.data;
  if (!isAddress(from)) return jsonErr("bad address", 400);

  const auth = await verifyWalletAuth({ req, address: from });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const author = auth.address.toLowerCase();
  const muteMsg = await chatMuteMessage(author);
  if (muteMsg) return jsonErr(muteMsg, 403);

  const text = (body ?? "").trim();
  const gif = gifUrl ?? null;
  if (!text && !gif) return jsonErr("message cannot be empty", 400);
  if (gif && !isAllowedGifUrl(gif)) return jsonErr("invalid gif url", 400);

  await prisma.chatMessage.create({
    data: { author, body: text, gifUrl: gif },
  });

  return jsonOk({ ok: true }, { status: 201 });
}
