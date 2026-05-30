import { NextRequest } from "next/server";
import { formatUnits, getAddress, isAddress } from "viem";

import { prisma } from "@/lib/db";
import { syncUserParticipantBets } from "@/lib/betSync";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { formatMicro } from "@/lib/exchange/units";
import { userLegs } from "@/lib/exchange/userStats";

export const dynamic = "force-dynamic";

export type ActivityKind =
  | "market_buy"
  | "market_sell"
  | "bet_created"
  | "bet_joined"
  | "bet_won"
  | "bet_lost"
  | "bet_push"
  | "bet_refunded"
  | "bet_cancelled"
  | "deposit"
  | "withdrawal";

type ActivityItem = {
  id: string;
  kind: ActivityKind;
  at: string; // ISO timestamp
  title: string;
  link: string;
  tokenSymbol: string | null;
  /** Primary amount (shares for trades, stake for bets) in display units. */
  amount: number | null;
  /** Signed PnL/cost in collateral display units when meaningful. */
  delta: number | null;
  /** Outcome / side label, e.g. "Yes", "BUY". */
  detail: string | null;
};

const num = (raw: string, decimals: number): number => {
  try {
    return Number(formatUnits(BigInt(raw), decimals));
  } catch {
    return 0;
  }
};

const eq = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Parse amount/token from wallet notification bodies. */
function parseWalletMeta(
  body: string | null,
): { amount: number | null; tokenSymbol: string | null } {
  if (!body) return { amount: null, tokenSymbol: null };
  const withdrew = body.match(/withdrew\s+([\d.]+)\s+([A-Za-z0-9.]+)/i);
  if (withdrew) {
    return {
      amount: Number.parseFloat(withdrew[1]),
      tokenSymbol: withdrew[2],
    };
  }
  const deposit = body.match(/started a\s+(\w+)\s+deposit/i);
  if (deposit) {
    const sym = deposit[1];
    return {
      amount: null,
      tokenSymbol: sym === "native-currency" ? "POL" : sym,
    };
  }
  return { amount: null, tokenSymbol: null };
}

/**
 * GET /api/users/[address]/activity
 * Full trading history: market buys/sells plus sidebet lifecycle events
 * (created, joined, won, lost, push, refunded, cancelled), newest first.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } },
) {
  const handle = decodeURIComponent(params.address).trim().replace(/^@/, "");
  if (!isAddress(handle)) return jsonErr("bad address", 400);
  const address = getAddress(handle);
  const lower = address.toLowerCase();

  await syncUserParticipantBets(address);

  const profileLink = `/u/${address}`;

  const [fills, bets, walletNotes] = await Promise.all([
    prisma.fill.findMany({
      where: {
        OR: [{ taker: lower }, { maker: lower }],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.bet.findMany({
      where: {
        OR: [
          { proposer: { equals: address, mode: "insensitive" } },
          { acceptor: { equals: address, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.notification.findMany({
      where: {
        recipient: lower,
        type: { in: ["deposit", "withdrawal"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const items: ActivityItem[] = [];

  // ---- Market trades (buys / sells from the user's perspective) ----
  const marketIds = [...new Set(fills.map((f) => f.marketId))];
  const markets = marketIds.length
    ? await prisma.market.findMany({
        where: { id: { in: marketIds } },
        select: {
          id: true,
          title: true,
          tokenSymbol: true,
          outcomes: { select: { index: true, label: true } },
        },
      })
    : [];
  const marketById = new Map(markets.map((m) => [m.id, m]));
  const legs = userLegs(fills, lower);
  let legIdx = 0;
  for (const leg of legs) {
    const m = marketById.get(leg.marketId);
    if (!m) continue;
    const shares = Number(formatMicro(leg.shares));
    const cost = Number(formatMicro(leg.cost));
    const label =
      m.outcomes.find((o) => o.index === leg.outcome)?.label ??
      `Outcome ${leg.outcome}`;
    items.push({
      id: `fill-${leg.marketId}-${legIdx++}-${leg.t}`,
      kind: leg.side === "BUY" ? "market_buy" : "market_sell",
      at: new Date(leg.t).toISOString(),
      title: m.title,
      link: `/markets/${m.id}`,
      tokenSymbol: m.tokenSymbol,
      amount: shares,
      // Buying spends collateral (negative cash), selling returns it (positive).
      delta: leg.side === "BUY" ? -cost : cost,
      detail: `${leg.side} ${label}`,
    });
  }

  // ---- Sidebet lifecycle ----
  for (const b of bets) {
    const isProposer = eq(b.proposer, address);
    const ownStakeRaw =
      isProposer
        ? b.proposerStake !== "0"
          ? b.proposerStake
          : b.amount
        : b.acceptorStake !== "0"
          ? b.acceptorStake
          : b.amount;
    const ownStake = num(ownStakeRaw, b.decimals);
    const fee = ownStake * 2 * (b.feeBps / 10000);
    const link = `/bets/${b.id}`;

    // Entry event: created (proposer) or joined (acceptor).
    items.push({
      id: `bet-${b.id}-entry`,
      kind: isProposer ? "bet_created" : "bet_joined",
      at: b.createdAt.toISOString(),
      title: b.title,
      link,
      tokenSymbol: b.tokenSymbol,
      amount: ownStake,
      delta: null,
      detail: isProposer ? "Created sidebet" : "Joined sidebet",
    });

    // Resolution event for terminal states.
    if (["Settled", "Refunded", "Cancelled"].includes(b.status)) {
      let kind: ActivityKind = "bet_refunded";
      let delta: number | null = null;
      let detail = "Refunded";
      if (b.status === "Cancelled") {
        kind = "bet_cancelled";
        detail = "Cancelled";
      } else if (b.status === "Settled") {
        if (!b.winner) {
          kind = "bet_push";
          detail = "Push — stake returned";
          delta = 0;
        } else if (eq(b.winner, address)) {
          kind = "bet_won";
          detail = "Won";
          delta = ownStake - fee;
        } else {
          kind = "bet_lost";
          detail = "Lost";
          delta = -ownStake;
        }
      }
      items.push({
        id: `bet-${b.id}-resolution`,
        kind,
        at: b.updatedAt.toISOString(),
        title: b.title,
        link,
        tokenSymbol: b.tokenSymbol,
        amount: ownStake,
        delta,
        detail,
      });
    }
  }

  // ---- Wallet deposits / withdrawals (from self-notifications) ----
  for (const n of walletNotes) {
    const kind = n.type as "deposit" | "withdrawal";
    const { amount, tokenSymbol } = parseWalletMeta(n.body);
    const isDeposit = kind === "deposit";
    items.push({
      id: `wallet-${n.id}`,
      kind,
      at: n.createdAt.toISOString(),
      title: n.title,
      link: profileLink,
      tokenSymbol,
      amount,
      delta:
        amount != null && Number.isFinite(amount)
          ? isDeposit
            ? amount
            : -amount
          : null,
      detail: n.body ?? (isDeposit ? "Deposit" : "Withdrawal"),
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return jsonOk({ activity: items.slice(0, 400) });
}
