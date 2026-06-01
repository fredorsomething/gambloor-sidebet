import { getAddress, isAddress } from "viem";

import { isAdminAddress } from "@/lib/admin";
import { applyBetOnchainSync } from "@/lib/betSync";
import { prisma } from "@/lib/db";
import { marketWithOutcomesSelect } from "@/lib/marketPrisma";
import { readBetV2 } from "@/lib/onchain";
import { displayResolver, hasCustomSettler } from "@/lib/settlerUtils";

export type ResolverSubjectType = "bet" | "market";

const ZERO = "0x0000000000000000000000000000000000000000";

export function sameWallet(a: string, b: string): boolean {
  try {
    return getAddress(a).toLowerCase() === getAddress(b).toLowerCase();
  } catch {
    return a.toLowerCase() === b.toLowerCase();
  }
}

export async function loadResolverSubject(
  subjectType: ResolverSubjectType,
  subjectId: number,
) {
  if (subjectType === "bet") {
    return loadBetSubjectForResolver(subjectId);
  }
  return prisma.market.findUnique({
    where: { id: subjectId },
    select: marketWithOutcomesSelect,
  });
}

/** Bet row for resolver flows, with acceptor/status synced from chain when possible. */
async function loadBetSubjectForResolver(subjectId: number) {
  let bet = await prisma.bet.findUnique({ where: { id: subjectId } });
  if (!bet) return null;

  try {
    const onchain = await readBetV2(
      bet.chainId,
      getAddress(bet.escrowAddress) as `0x${string}`,
      BigInt(bet.onchainId),
    );
    if (onchain && !bet.escrowRevisionNeeded) {
      await applyBetOnchainSync(bet, onchain, { notify: false });
      bet = (await prisma.bet.findUnique({ where: { id: subjectId } })) ?? bet;
    }
  } catch (err) {
    console.warn("resolver subject bet sync failed", subjectId, err);
  }

  return bet;
}

/** Who must approve a resolver change (the other party on the subject). */
export function resolverCounterparty(
  subjectType: ResolverSubjectType,
  subject: { proposer?: string; acceptor?: string | null; creator?: string; settler: string },
  requester: string,
): string | null {
  const parties =
    subjectType === "bet"
      ? [subject.proposer, subject.acceptor]
      : [subject.creator, subject.settler];

  const normalized = parties.filter(
    (p): p is string => !!p && p.toLowerCase() !== ZERO,
  );
  if (!normalized.some((p) => sameWallet(p, requester))) return null;

  const other = normalized.find((p) => !sameWallet(p, requester));
  if (!other) return null;
  try {
    return getAddress(other).toLowerCase();
  } catch {
    return other.toLowerCase();
  }
}

/** Counterparty approves/declines — must be a participant, not the requester. */
export function canRespondToResolverRequest(
  subjectType: ResolverSubjectType,
  subject: {
    proposer?: string;
    acceptor?: string | null;
    creator?: string;
    settler: string;
  },
  requester: string,
  responder: string,
): boolean {
  if (sameWallet(responder, requester)) return false;
  return isResolverParticipant(subjectType, subject, responder);
}

export function isResolverParticipant(
  subjectType: ResolverSubjectType,
  subject: {
    proposer?: string;
    acceptor?: string | null;
    creator?: string;
    settler: string;
  },
  address: string,
): boolean {
  if (subjectType === "bet") {
    return (
      (!!subject.proposer && sameWallet(subject.proposer, address)) ||
      (!!subject.acceptor && sameWallet(subject.acceptor, address))
    );
  }
  return (
    (!!subject.creator && sameWallet(subject.creator, address)) ||
    sameWallet(subject.settler, address)
  );
}

export async function validateResolverRequest(
  subjectType: ResolverSubjectType,
  subjectId: number,
  requester: string,
  suggestedRaw: string,
): Promise<
  | {
      ok: true;
      counterparty: string;
      suggested: string;
      title: string;
      link: string;
    }
  | { ok: false; reason: string; status?: number }
> {
  if (!isAddress(suggestedRaw)) {
    return { ok: false, reason: "pick a valid resolver wallet", status: 400 };
  }

  const suggested = getAddress(suggestedRaw);
  const subject = await loadResolverSubject(subjectType, subjectId);
  if (!subject) return { ok: false, reason: "not found", status: 404 };

  if (hasCustomSettler(subject)) {
    return { ok: false, reason: "a custom resolver is already set", status: 409 };
  }

  if (!isResolverParticipant(subjectType, subject, requester)) {
    return { ok: false, reason: "only participants can request a resolver", status: 403 };
  }

  const counterparty = resolverCounterparty(subjectType, subject, requester);
  if (!counterparty) {
    return {
      ok: false,
      reason:
        subjectType === "bet"
          ? "both sides must be matched before adding a resolver"
          : "could not determine counterparty",
      status: 409,
    };
  }

  if (subjectType === "bet") {
    const bet = subject as { status: string; settler: string; acceptor?: string | null };
    if (bet.status !== "Matched" || !bet.acceptor) {
      return {
        ok: false,
        reason: "sidebet must be matched before adding a resolver",
        status: 409,
      };
    }
    if (!isAdminAddress(bet.settler)) {
      return {
        ok: false,
        reason:
          "additional resolvers are only supported when escrow uses the platform settler",
        status: 409,
      };
    }
  } else {
    const market = subject as { status: string };
    if (market.status !== "Open") {
      return { ok: false, reason: "market must be open", status: 409 };
    }
  }

  const currentResolver = displayResolver(subject).toLowerCase();
  const blocked = new Set(
    [
      requester,
      counterparty,
      currentResolver,
      subject.settler,
      ...(subjectType === "bet"
        ? [(subject as { proposer: string }).proposer, (subject as { acceptor?: string | null }).acceptor]
        : [(subject as { creator: string }).creator]),
    ]
      .filter(Boolean)
      .map((x) => x!.toLowerCase()),
  );
  if (blocked.has(suggested.toLowerCase())) {
    return {
      ok: false,
      reason: "resolver cannot be a participant or the current settler",
      status: 400,
    };
  }

  const title =
    subjectType === "bet"
      ? (subject as { title: string }).title
      : (subject as { title: string }).title;
  const link =
    subjectType === "bet" ? `/bets/${subjectId}` : `/markets/${subjectId}`;

  return { ok: true, counterparty, suggested, title, link };
}

export async function applyApprovedResolver(
  subjectType: ResolverSubjectType,
  subjectId: number,
  suggested: string,
): Promise<void> {
  const addr = getAddress(suggested);
  if (subjectType === "bet") {
    await prisma.bet.update({
      where: { id: subjectId },
      data: { customSettler: addr },
    });
    return;
  }
  await prisma.market.update({
    where: { id: subjectId },
    data: { customSettler: addr },
  });
}
