import type { BetStatusName } from "@/lib/abi";
import type { BetRow, GetBetResponse } from "@/lib/types";

const ZERO = "0x0000000000000000000000000000000000000000";

const STATUS_RANK: Record<BetStatusName, number> = {
  None: 0,
  Open: 1,
  Matched: 2,
  Settled: 3,
  Cancelled: 3,
  Refunded: 3,
};

export function betStatusRank(status: BetStatusName): number {
  return STATUS_RANK[status] ?? 0;
}

/** Prefer the more mature lifecycle state (Settled beats Matched, etc.). */
export function mergeBetStatus(
  indexed: BetStatusName,
  fromChain: BetStatusName,
): BetStatusName {
  return betStatusRank(fromChain) >= betStatusRank(indexed)
    ? fromChain
    : indexed;
}

export function betAcceptor(
  bet: BetRow,
  onchain?: GetBetResponse["onchain"],
): string | null {
  if (onchain?.acceptor && onchain.acceptor !== ZERO) return onchain.acceptor;
  return bet.acceptor;
}

export function betHasAcceptor(
  bet: BetRow,
  onchain?: GetBetResponse["onchain"],
): boolean {
  const addr = betAcceptor(bet, onchain);
  return !!addr && addr.toLowerCase() !== ZERO;
}

/** Negotiated terms are locked off-chain but the on-chain offer is being replaced. */
export function betEscrowRevisionPending(bet: BetRow): boolean {
  return bet.escrowRevisionNeeded;
}

export function betIsTerminal(status: BetStatusName): boolean {
  return status === "Settled" || status === "Cancelled" || status === "Refunded";
}

/**
 * Effective status for UI/actions. On-chain can advance the indexed snapshot
 * (Matched → Settled) but never regress it — stale RPC reads must not flash
 * "Awaiting settlement" on an already-settled bet.
 */
export function resolveBetStatus(
  bet: BetRow,
  onchain?: GetBetResponse["onchain"],
): BetStatusName {
  if (betEscrowRevisionPending(bet)) {
    return "Open";
  }

  const indexed = bet.status as BetStatusName;
  const hasAcceptor = betHasAcceptor(bet, onchain);
  const chainRaw = (onchain?.status ?? indexed) as BetStatusName;
  const fromChain: BetStatusName =
    chainRaw === "Open" && hasAcceptor ? "Matched" : chainRaw;

  return mergeBetStatus(indexed, fromChain);
}

/** Poll live bet detail while status can still change; stop on terminal states. */
export function betDetailPollInterval(
  bet: BetRow,
  onchain?: GetBetResponse["onchain"],
): number | false {
  const status = resolveBetStatus(bet, onchain);
  if (betIsTerminal(status)) return false;
  return status === "Open" || status === "Matched" ? 2_000 : 5_000;
}

export function betShowMatchup(
  bet: BetRow,
  onchain?: GetBetResponse["onchain"],
): boolean {
  return betHasAcceptor(bet, onchain);
}
