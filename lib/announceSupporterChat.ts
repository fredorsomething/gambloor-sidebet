import { getAddress } from "viem";

import { buildSupporterChatMessage } from "@/lib/chatSupporter";
import { prisma } from "@/lib/db";
import { shortAddr } from "@/lib/utils";

/** Post a pink Supporter badge announcement to global chat. */
export async function announceSupporterBadgeInChat(address: string): Promise<void> {
  const addr = getAddress(address);
  const user = await prisma.user.findUnique({
    where: { address: addr },
    select: { username: true },
  });
  const label = user?.username ? `@${user.username}` : shortAddr(addr);
  await prisma.chatMessage.create({
    data: {
      author: addr.toLowerCase(),
      body: buildSupporterChatMessage(label),
      gifUrl: null,
    },
  });
}
