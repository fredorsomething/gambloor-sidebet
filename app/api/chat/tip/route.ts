import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { chatMuteMessage } from "@/lib/chatMute";
import { TIP_MSG_PREFIX } from "@/lib/chatTip";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { shortAddr } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TipSchema = z.object({
  from: z.string(),
  to: z.string(),
  amount: z.string().trim().min(1).max(32),
  symbol: z.string().trim().min(1).max(16),
});

/** POST /api/chat/tip — announce an on-chain tip in global chat. */
export async function POST(req: NextRequest) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonErr("invalid body", 400);
  }

  const parsed = TipSchema.safeParse(json);
  if (!parsed.success) return jsonErr("invalid tip payload", 400);

  const { from, to, amount, symbol } = parsed.data;
  if (!isAddress(from) || !isAddress(to)) return jsonErr("bad address", 400);

  const auth = await verifyWalletAuth({ req, address: from });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const author = auth.address.toLowerCase();
  const muteMsg = await chatMuteMessage(author);
  if (muteMsg) return jsonErr(muteMsg, 403);

  const recipient = getAddress(to).toLowerCase();
  const [senderUser, recipientUser] = await Promise.all([
    prisma.user.findUnique({
      where: { address: getAddress(from) },
      select: { username: true },
    }),
    prisma.user.findUnique({
      where: { address: getAddress(to) },
      select: { username: true },
    }),
  ]);

  const senderLabel = senderUser?.username
    ? `@${senderUser.username}`
    : shortAddr(from);
  const recipientLabel = recipientUser?.username
    ? `@${recipientUser.username}`
    : shortAddr(recipient);

  const body = `${TIP_MSG_PREFIX}${senderLabel} tipped ${recipientLabel} ${amount} ${symbol}`;

  await prisma.chatMessage.create({
    data: { author, body, gifUrl: null },
  });

  return jsonOk({ ok: true }, { status: 201 });
}
