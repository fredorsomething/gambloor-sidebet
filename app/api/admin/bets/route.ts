import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/bets?address=&status=&q= — list sidebets for admin oversight,
 * each enriched with its latest resolution proposal so an admin can see the
 * proposed outcome alongside the on-chain settlement state.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(
    req,
    req.nextUrl.searchParams.get("address") ?? "",
  );
  if (!gate.ok) return jsonErr(gate.error, gate.status);

  const status = req.nextUrl.searchParams.get("status")?.trim();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  const where: {
    status?: string | { in: string[] };
    OR?: { title?: { contains: string; mode: "insensitive" } }[];
  } = {};

  if (status && status !== "all") {
    where.status = status.includes(",")
      ? { in: status.split(",").map((s) => s.trim()) }
      : status;
  }
  if (q) {
    where.OR = [{ title: { contains: q, mode: "insensitive" } }];
  }

  const bets = await prisma.bet.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Attach the latest resolution proposal per bet (single query).
  const ids = bets.map((b) => b.id);
  const proposals = ids.length
    ? await prisma.resolutionProposal.findMany({
        where: { subjectType: "bet", subjectId: { in: ids } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const latestBySubject = new Map<number, (typeof proposals)[number]>();
  for (const p of proposals) {
    if (!latestBySubject.has(p.subjectId)) latestBySubject.set(p.subjectId, p);
  }

  const items = bets.map((b) => {
    const outcomes = Array.isArray(b.outcomes)
      ? (b.outcomes as unknown as string[])
      : [];
    const p = latestBySubject.get(b.id);
    return {
      id: b.id,
      title: b.title,
      description: b.description,
      status: b.status,
      proposer: b.proposer,
      acceptor: b.acceptor,
      settler: b.settler,
      outcomes,
      winningOutcome: b.winningOutcome,
      winner: b.winner,
      winningLabel:
        b.winningOutcome != null ? (outcomes[b.winningOutcome] ?? null) : null,
      createdAt: b.createdAt,
      proposal: p
        ? {
            id: p.id,
            status: p.status,
            proposedBy: p.proposedBy,
            proposedOutcome: p.proposedOutcome,
            proposedLabel:
              outcomes[p.proposedOutcome] ?? `Outcome ${p.proposedOutcome}`,
            note: p.note,
          }
        : null,
    };
  });

  return jsonOk({ bets: items });
}
