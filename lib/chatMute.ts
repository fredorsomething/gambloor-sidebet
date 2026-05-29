import { prisma } from "@/lib/db";

/** True if the wallet is muted from global chat right now. */
export async function isChatMuted(address: string): Promise<boolean> {
  const row = await prisma.chatMute.findUnique({
    where: { address: address.toLowerCase() },
  });
  if (!row) return false;
  if (!row.mutedUntil) return true;
  return row.mutedUntil.getTime() > Date.now();
}

export async function chatMuteMessage(address: string): Promise<string | null> {
  if (!(await isChatMuted(address))) return null;
  const row = await prisma.chatMute.findUnique({
    where: { address: address.toLowerCase() },
  });
  if (!row) return null;
  if (!row.mutedUntil) return "You are permanently muted from global chat.";
  const mins = Math.ceil((row.mutedUntil.getTime() - Date.now()) / 60_000);
  if (mins <= 0) return null;
  return `You are muted from global chat for ${mins} more minute${mins === 1 ? "" : "s"}.`;
}
