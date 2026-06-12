export const MIN_ODDS_PERCENT = 1;
export const MAX_ODDS_PERCENT = 99;

/** Implied win probability for the proposer (prediction-market style). */
export function oddsPercentFromStakes(
  yourStake: number,
  theirStake: number,
): number | null {
  if (!Number.isFinite(yourStake) || !Number.isFinite(theirStake)) return null;
  if (yourStake <= 0 || theirStake <= 0) return null;
  return clampOddsPercent((yourStake / (yourStake + theirStake)) * 100);
}

export function clampOddsPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 50;
  const rounded = Math.round(percent * 10) / 10;
  return Math.min(MAX_ODDS_PERCENT, Math.max(MIN_ODDS_PERCENT, rounded));
}

/** Counterparty stake from your stake and target odds (%). */
export function theirStakeFromYoursAndOdds(
  yourStake: number,
  oddsPercent: number,
): number | null {
  if (!Number.isFinite(yourStake) || !Number.isFinite(oddsPercent)) return null;
  if (yourStake <= 0 || oddsPercent <= 0 || oddsPercent >= 100) return null;
  return (yourStake * (100 - oddsPercent)) / oddsPercent;
}

/** Your stake from counterparty stake and target odds (%). */
export function yourStakeFromTheirsAndOdds(
  theirStake: number,
  oddsPercent: number,
): number | null {
  if (!Number.isFinite(theirStake) || !Number.isFinite(oddsPercent)) return null;
  if (theirStake <= 0 || oddsPercent <= 0 || oddsPercent >= 100) return null;
  return (theirStake * oddsPercent) / (100 - oddsPercent);
}

export function parseStakeFloat(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Format a calculated stake for an input field (trim trailing zeros). */
export function formatCalculatedStake(value: number, maxDecimals = 6): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  const fixed = value.toFixed(maxDecimals);
  return fixed.replace(/\.?0+$/, "");
}
