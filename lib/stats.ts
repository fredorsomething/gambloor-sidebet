import { formatUnits } from "viem";

/**
 * Minimal shape needed to compute PnL. PnL is reported in "dollars" by
 * normalizing each stake by its token decimals — valid because every supported
 * collateral (USDC / pUSD / USDC.e) is a 1:1 USD stablecoin with 6 decimals.
 */
export type StatBet = {
  proposer: string;
  acceptor: string | null;
  amount: string;
  decimals: number;
  feeBps: number;
  status: string; // Open | Matched | Settled | Cancelled | Refunded
  winner: string | null;
};

export type UserStats = {
  wins: number;
  losses: number;
  pushes: number;
  settled: number;
  matched: number;
  open: number;
  volume: number; // total dollars staked across matched + settled bets
  pnl: number; // realized dollars from settled bets
  winRate: number; // 0..1 over decided (win+loss) bets
};

function dollars(amount: string, decimals: number): number {
  try {
    return Number(formatUnits(BigInt(amount), decimals));
  } catch {
    return 0;
  }
}

const eq = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function emptyStats(): UserStats {
  return {
    wins: 0,
    losses: 0,
    pushes: 0,
    settled: 0,
    matched: 0,
    open: 0,
    volume: 0,
    pnl: 0,
    winRate: 0,
  };
}

/** Per-bet PnL contribution for a participant. */
function applyBet(stats: UserStats, bet: StatBet, addr: string) {
  const isProposer = eq(bet.proposer, addr);
  const isAcceptor = eq(bet.acceptor, addr);
  if (!isProposer && !isAcceptor) return;

  const stake = dollars(bet.amount, bet.decimals);

  if (bet.status === "Open") {
    if (isProposer) stats.open += 1;
    return;
  }
  if (bet.status === "Cancelled" || bet.status === "Refunded") {
    return; // no realized PnL
  }
  if (bet.status === "Matched") {
    stats.matched += 1;
    stats.volume += stake;
    return;
  }
  if (bet.status === "Settled") {
    stats.settled += 1;
    stats.volume += stake;
    if (!bet.winner) {
      stats.pushes += 1; // push: stake refunded, 0 pnl
      return;
    }
    const fee = stake * 2 * (bet.feeBps / 10000);
    if (eq(bet.winner, addr)) {
      stats.wins += 1;
      stats.pnl += stake - fee; // received pool - fee, net of own stake
    } else {
      stats.losses += 1;
      stats.pnl -= stake;
    }
  }
}

export function computeUserStats(bets: StatBet[], address: string): UserStats {
  const stats = emptyStats();
  for (const bet of bets) applyBet(stats, bet, address);
  const decided = stats.wins + stats.losses;
  stats.winRate = decided > 0 ? stats.wins / decided : 0;
  return stats;
}

export type LeaderboardEntry = {
  address: string;
} & UserStats;

export function computeLeaderboard(bets: StatBet[]): LeaderboardEntry[] {
  const byAddr = new Map<string, UserStats>();
  const touch = (addr: string) => {
    const k = addr.toLowerCase();
    if (!byAddr.has(k)) byAddr.set(k, emptyStats());
    return byAddr.get(k)!;
  };

  for (const bet of bets) {
    applyBet(touch(bet.proposer), bet, bet.proposer);
    if (bet.acceptor) applyBet(touch(bet.acceptor), bet, bet.acceptor);
  }

  const entries: LeaderboardEntry[] = [];
  for (const [address, stats] of byAddr.entries()) {
    const decided = stats.wins + stats.losses;
    stats.winRate = decided > 0 ? stats.wins / decided : 0;
    // Only rank addresses that have actually settled at least one bet.
    if (stats.settled === 0) continue;
    entries.push({ address, ...stats });
  }

  entries.sort(
    (a, b) =>
      b.pnl - a.pnl ||
      b.wins - a.wins ||
      b.volume - a.volume ||
      a.address.localeCompare(b.address),
  );
  return entries;
}
