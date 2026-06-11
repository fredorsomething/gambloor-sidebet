import { formatUnits } from "viem";

import { sidebetPayoutWei } from "@/lib/betEconomics";
import { prisma } from "@/lib/db";
import { resolveStakes } from "@/lib/stats";

export type PlatformStats = {
  /** Total USD wagered plus total USD paid out across sidebets. */
  totalVolumeUsd: number;
  /** Total registered users on the platform. */
  userCount: number;
};

function stakeWei(
  raw: string | null | undefined,
  fallback: string,
): bigint {
  const amount = raw && raw !== "0" ? raw : fallback;
  try {
    return BigInt(amount || "0");
  } catch {
    return 0n;
  }
}

function betVolumeUsd(bet: {
  amount: string;
  proposerStake: string | null;
  acceptorStake: string | null;
  decimals: number;
  feeBps: number;
  status: string;
  winner: string | null;
}): number {
  const { proposer, acceptor } = resolveStakes(bet);
  const proposerWei = stakeWei(bet.proposerStake, bet.amount);
  const acceptorWei = stakeWei(bet.acceptorStake, bet.amount);

  const wagered =
    bet.status === "Open" ? proposer : proposer + acceptor;

  let paidOut = 0;
  if (bet.status === "Settled") {
    if (bet.winner) {
      paidOut = Number(
        formatUnits(
          sidebetPayoutWei(proposerWei, acceptorWei, bet.feeBps),
          bet.decimals,
        ),
      );
    } else {
      paidOut = proposer + acceptor;
    }
  } else if (bet.status === "Refunded") {
    paidOut = proposer + acceptor;
  }

  return wagered + paidOut;
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
        feeBps: true,
        status: true,
        winner: true,
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
