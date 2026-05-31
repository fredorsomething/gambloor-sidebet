import { getAddress, isAddress } from "viem";

import { isAdminAddress } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { displayResolver, hasCustomSettler } from "@/lib/settlerUtils";

export type ResolverSubjectType = "bet" | "market";

export async function loadResolverSubject(
  subjectType: ResolverSubjectType,
  subjectId: number,
) {
  if (subjectType === "bet") {
    return prisma.bet.findUnique({ where: { id: subjectId } });
  }
  return prisma.market.findUnique({ where: { id: subjectId } });
}

/** Who must approve a resolver change (the other party on the subject). */
export function resolverCounterparty(
  subjectType: ResolverSubjectType,
  subject: { proposer?: string; acceptor?: string | null; creator?: string; settler: string },
  requester: string,
): string | null {
  const req = requester.toLowerCase();
  if (subjectType === "bet") {
    if (subject.proposer?.toLowerCase() === req) {
      return subject.acceptor?.toLowerCase() ?? null;
    }
    if (subject.acceptor?.toLowerCase() === req) {
      return subject.proposer?.toLowerCase() ?? null;
    }
    return null;
  }
  if (subject.creator?.toLowerCase() === req) {
    return subject.settler.toLowerCase();
  }
  if (subject.settler.toLowerCase() === req) {
    return subject.creator?.toLowerCase() ?? null;
  }
  return null;
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
  const a = address.toLowerCase();
  if (subjectType === "bet") {
    return (
      subject.proposer?.toLowerCase() === a ||
      subject.acceptor?.toLowerCase() === a
    );
  }
  return (
    subject.creator?.toLowerCase() === a ||
    subject.settler.toLowerCase() === a
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
