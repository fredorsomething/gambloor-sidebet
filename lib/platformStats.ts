import { prisma } from "@/lib/db";
import { resolveStakes } from "@/lib/stats";

export type PlatformStats = {
  /** Total USD staked across open, matched, and settled sidebets. */
  totalVolumeUsd: number;
  /** Total registered users on the platform. */
  userCount: number;
};

export async function getPlatformStats(): Promise<PlatformStats> {
  const [bets, userCount] = await Promise.all([
    prisma.bet.findMany({
      where: { status: { in: ["Open", "Matched", "Settled"] } },
      select: {
        amount: true,
        proposerStake: true,
        acceptorStake: true,
        decimals: true,
        status: true,
      },
    }),
    prisma.user.count(),
  ]);

  let totalVolumeUsd = 0;

  for (const bet of bets) {
    const { proposer, acceptor } = resolveStakes(bet);
    totalVolumeUsd +=
      bet.status === "Open" ? proposer : proposer + acceptor;
  }

  return { totalVolumeUsd, userCount };
}

export function formatPlatformAmount(amount: number): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
