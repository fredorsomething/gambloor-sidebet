import type { BetStatusName } from "@/lib/abi";
import type { BetRow, GetBetResponse } from "@/lib/types";

const ZERO = "0x0000000000000000000000000000000000000000";

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

/** Effective status for UI/actions; never regress below the indexed snapshot. */
export function resolveBetStatus(
  bet: BetRow,
  onchain?: GetBetResponse["onchain"],
): BetStatusName {
  // Mid-revision the old escrow id may be cancelled on-chain while the proposer
  // publishes a replacement — keep the listing Open until revise-escrow completes.
  if (betEscrowRevisionPending(bet)) {
    return "Open";
  }

  const hasAcceptor = betHasAcceptor(bet, onchain);
  const chainStatus = onchain?.status ?? bet.status;
  let status: BetStatusName =
    chainStatus === "Open" && hasAcceptor ? "Matched" : chainStatus;

  const indexed = bet.status;
  if (
    (indexed === "Matched" ||
      indexed === "Settled" ||
      indexed === "Cancelled" ||
      indexed === "Refunded") &&
    status === "Open"
  ) {
    status = indexed;
  }

  return status;
}

export function betShowMatchup(
  bet: BetRow,
  onchain?: GetBetResponse["onchain"],
): boolean {
  return betHasAcceptor(bet, onchain);
}
