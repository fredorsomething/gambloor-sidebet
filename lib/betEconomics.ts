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
