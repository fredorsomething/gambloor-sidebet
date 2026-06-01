import type { Bet } from "@prisma/client";

import { buildFeedChatMessage } from "@/lib/chatFeed";
import { prisma } from "@/lib/db";
import { shortAddr } from "@/lib/utils";

async function postFeedChatMessage(
  author: string,
  body: string,
): Promise<void> {
  await prisma.chatMessage.create({
    data: {
      author: author.toLowerCase(),
      body,
      gifUrl: null,
    },
  });
}

async function userLabel(address: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { address },
    select: { username: true },
  });
  return user?.username ? `@${user.username}` : shortAddr(address);
}

/** New market went live (approved). */
export async function announceMarketCreatedInChat(args: {
  id: number;
  title: string;
  creator: string;
}): Promise<void> {
  const label = await userLabel(args.creator);
  await postFeedChatMessage(
    args.creator,
    buildFeedChatMessage(
      "market",
      `${label} created market "${args.title}"`,
      `/markets/${args.id}`,
    ),
  );
}

/** Sidebet accepted — both sides locked in. */
export async function announceBetMatchedInChat(
  bet: Pick<Bet, "id" | "title" | "proposer">,
): Promise<void> {
  const claimed = await prisma.bet.updateMany({
    where: { id: bet.id, matchedFeedAt: null },
    data: { matchedFeedAt: new Date() },
  });
  if (claimed.count === 0) return;

  await postFeedChatMessage(
    bet.proposer,
    buildFeedChatMessage(
      "bet-matched",
      `Sidebet matched: "${bet.title}"`,
      `/bets/${bet.id}`,
    ),
  );
}

/** Sidebet resolved on-chain. */
export async function announceBetSettledInChat(
  bet: Pick<Bet, "id" | "title" | "proposer" | "outcomes" | "winningOutcome">,
): Promise<void> {
  const claimed = await prisma.bet.updateMany({
    where: { id: bet.id, settledFeedAt: null },
    data: { settledFeedAt: new Date() },
  });
  if (claimed.count === 0) return;

  const outcomes = Array.isArray(bet.outcomes)
    ? (bet.outcomes as unknown as string[])
    : [];
  const winLabel =
    bet.winningOutcome != null ? outcomes[bet.winningOutcome] : undefined;
  const suffix = winLabel ? ` — ${winLabel} won` : "";
  await postFeedChatMessage(
    bet.proposer,
    buildFeedChatMessage(
      "bet-settled",
      `Sidebet settled: "${bet.title}"${suffix}`,
      `/bets/${bet.id}`,
    ),
  );
}
