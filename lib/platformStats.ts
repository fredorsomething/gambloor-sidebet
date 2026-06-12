import { prisma } from "@/lib/db";
import { resolveStakes } from "@/lib/stats";

export type PlatformStats = {
  /** Total USD wagered (staked) across sidebets. */
  totalVolumeUsd: number;
  /** Total registered users on the platform. */
  userCount: number;
};

/**
 * Dollars actually staked into a bet. Payouts are intentionally NOT counted —
 * a settled bet's payout is the same money that was wagered, and counting both
 * doubles the reported volume.
 */
function betVolumeUsd(bet: {
  amount: string;
  proposerStake: string | null;
  acceptorStake: string | null;
  decimals: number;
  status: string;
}): number {
  const { proposer, acceptor } = resolveStakes(bet);
  return bet.status === "Open" ? proposer : proposer + acceptor;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const [bets, userCount] = await Promise.all([
    prisma.bet.findMany({
      where: { status: { in: ["Open", "Matched", "Settled", "Refunded"] } },
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

  const totalVolumeUsd = bets.reduce((sum, bet) => sum + betVolumeUsd(bet), 0);

  return { totalVolumeUsd, userCount };
}

export function formatPlatformAmount(amount: number): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
