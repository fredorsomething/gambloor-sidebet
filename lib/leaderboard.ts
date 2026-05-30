export type LeaderboardPeriod = "all" | "month" | "week" | "day";

export const LEADERBOARD_PERIODS: LeaderboardPeriod[] = [
  "all",
  "month",
  "week",
  "day",
];

export function parseLeaderboardPeriod(raw: string | null): LeaderboardPeriod {
  if (raw === "month" || raw === "week" || raw === "day") return raw;
  return "all";
}

/** UTC start of the current calendar day / week (Mon) / month, or null for all-time. */
export function periodStartUtc(period: LeaderboardPeriod): Date | null {
  if (period === "all") return null;

  const now = new Date();
  if (period === "day") {
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  if (period === "month") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  // week — Monday 00:00 UTC
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const weekday = start.getUTCDay(); // 0 = Sun … 6 = Sat
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

export function periodLabel(period: LeaderboardPeriod): string {
  switch (period) {
    case "all":
      return "All time";
    case "month":
      return "Monthly";
    case "week":
      return "Weekly";
    case "day":
      return "Daily";
  }
}

export function periodDescription(period: LeaderboardPeriod): string {
  switch (period) {
    case "all":
      return "Top sidebettors ranked by realized profit.";
    case "month":
      return "Top PnL from bets settled this calendar month (UTC).";
    case "week":
      return "Top PnL from bets settled this week (Mon–Sun UTC).";
    case "day":
      return "Top PnL from bets settled today (UTC).";
  }
}

export function periodEmptyMessage(period: LeaderboardPeriod): string {
  switch (period) {
    case "all":
      return "No settled bets yet. The throne is up for grabs.";
    case "month":
      return "No settlements this month yet.";
    case "week":
      return "No settlements this week yet.";
    case "day":
      return "No settlements today yet.";
  }
}
