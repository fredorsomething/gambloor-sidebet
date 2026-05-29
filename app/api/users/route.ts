import { NextRequest } from "next/server";

import { collectDirectoryUsers } from "@/lib/directory";
import { prisma } from "@/lib/db";
import { getRepScores } from "@/lib/rep";
import { jsonOk } from "@/lib/serialize";
import { computeUserStats, type StatBet } from "@/lib/stats";

export const dynamic = "force-dynamic";

/**
 * GET /api/users?q=foo — public directory of every wallet that has interacted
 * with Sidebet (created/took bets, placed orders, traded, commented, or saved a
 * profile). Named users come first (A-Z by username), then unnamed wallets.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();

  let users = await collectDirectoryUsers();

  const [bets, repScores] = await Promise.all([
    prisma.bet.findMany({
      select: {
        proposer: true,
        acceptor: true,
        amount: true,
        decimals: true,
        feeBps: true,
        status: true,
        winner: true,
      },
    }),
    getRepScores(users.map((u) => u.address)),
  ]);
  const statBets = bets as StatBet[];

  users = users.map((u) => {
    const stats = computeUserStats(statBets, u.address);
    return {
      ...u,
      rep: repScores.get(u.address.toLowerCase()) ?? 0,
      pnl: stats.pnl,
    };
  });

  if (q) {
    users = users.filter(
      (u) =>
        u.username?.toLowerCase().includes(q) ||
        u.address.toLowerCase().includes(q) ||
        u.bio?.toLowerCase().includes(q),
    );
  }

  // Sort: named users alphabetically (case-insensitive), unnamed wallets last.
  users.sort((a, b) => {
    const an = a.username?.toLowerCase();
    const bn = b.username?.toLowerCase();
    if (an && bn) return an.localeCompare(bn);
    if (an) return -1;
    if (bn) return 1;
    return a.address.toLowerCase().localeCompare(b.address.toLowerCase());
  });

  return jsonOk({ users });
}
