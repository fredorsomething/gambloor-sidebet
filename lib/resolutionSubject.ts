import { prisma } from "@/lib/db";

export type SubjectType = "bet" | "market";

export type SubjectInfo = {
  title: string;
  link: string;
  outcomes: string[];
  /** Lowercase addresses that should be notified about this subject. */
  participants: string[];
  settler: string | null;
  status: string;
};

/** Load shared display + routing info for a bet or market. */
export async function loadSubject(
  subjectType: SubjectType,
  subjectId: number,
): Promise<SubjectInfo | null> {
  if (subjectType === "bet") {
    const bet = await prisma.bet.findUnique({ where: { id: subjectId } });
    if (!bet) return null;
    const outcomes = Array.isArray(bet.outcomes)
      ? (bet.outcomes as unknown as string[])
      : [];
    return {
      title: bet.title,
      link: `/bets/${bet.id}`,
      outcomes,
      participants: [bet.proposer, bet.acceptor, bet.settler].filter(
        (a): a is string => !!a,
      ),
      settler: bet.settler,
      status: bet.status,
    };
  }

  const market = await prisma.market.findUnique({
    where: { id: subjectId },
    include: { outcomes: { orderBy: { index: "asc" } } },
  });
  if (!market) return null;
  return {
    title: market.title,
    link: `/markets/${market.id}`,
    outcomes: market.outcomes.map((o) => o.label),
    participants: [market.creator, market.settler].filter(
      (a): a is string => !!a,
    ),
    settler: market.settler,
    status: market.status,
  };
}

/** Whether `address` is allowed to propose a resolution for this subject. */
export async function canProposeResolution(
  subjectType: SubjectType,
  subjectId: number,
  address: string,
): Promise<boolean> {
  const a = address.toLowerCase();
  if (subjectType === "bet") {
    const bet = await prisma.bet.findUnique({ where: { id: subjectId } });
    if (!bet) return false;
    return [bet.proposer, bet.acceptor, bet.settler]
      .filter(Boolean)
      .some((x) => x!.toLowerCase() === a);
  }
  const market = await prisma.market.findUnique({ where: { id: subjectId } });
  if (!market) return false;
  return [market.creator, market.settler].some((x) => x.toLowerCase() === a);
}
