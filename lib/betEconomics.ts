function stakeWei(raw: string | null | undefined, fallback: string): bigint {
  const amount = raw && raw !== "0" ? raw : fallback;
  try {
    return BigInt(amount || "0");
  } catch {
    return 0n;
  }
}

/** Total pool locked or proposed for a sidebet (both stakes). */
export function sidebetPoolWei(bet: {
  amount: string;
  proposerStake?: string | null;
  acceptorStake?: string | null;
}): bigint {
  return (
    stakeWei(bet.proposerStake, bet.amount) +
    stakeWei(bet.acceptorStake, bet.amount)
  );
}

/** Gross payout to the winner (pool minus settler fee). */
export function sidebetPayoutWei(
  proposerStakeWei: bigint,
  acceptorStakeWei: bigint,
  feeBps: number,
): bigint {
  const pool = proposerStakeWei + acceptorStakeWei;
  return (pool * BigInt(10000 - feeBps)) / 10000n;
}

/** Economics for someone taking the open acceptor side. */
export function acceptorTakeEconomics(
  proposerStakeWei: bigint,
  acceptorStakeWei: bigint,
  feeBps: number,
) {
  const payoutWei = sidebetPayoutWei(
    proposerStakeWei,
    acceptorStakeWei,
    feeBps,
  );
  return {
    youBetWei: acceptorStakeWei,
    /** Total payout to the winner (pool minus fee), not net profit. */
    toWinWei: payoutWei,
    payoutWei,
  };
}
