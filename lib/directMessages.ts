import { prisma } from "@/lib/db";
import { isDmBlocked } from "@/lib/dmBlocks";

/** Deterministic conversation key independent of message direction. */
export function dmPairKey(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join("|");
}

/** Insert a DM unless either party has blocked the other. */
export async function createDirectMessage(args: {
  sender: string;
  recipient: string;
  body: string;
  gifUrl?: string | null;
}) {
  const sender = args.sender.toLowerCase();
  const recipient = args.recipient.toLowerCase();
  if (sender === recipient) return null;
  if (await isDmBlocked(sender, recipient)) return null;

  return prisma.directMessage.create({
    data: {
      pair: dmPairKey(sender, recipient),
      sender,
      recipient,
      body: args.body,
      gifUrl: args.gifUrl ?? null,
    },
  });
}
