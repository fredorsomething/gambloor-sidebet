import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { verifyWalletAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonErr, jsonOk } from "@/lib/serialize";

export type SentimentSubjectType = "bet" | "market";

export type SentimentSummary = {
  totalVotes: number;
  counts: { index: number; count: number }[];
  yourVote: number | null;
};

const VoteSchema = z.object({
  voter: z.string().refine(isAddress, "bad voter"),
  outcomeIndex: z.number().int().min(0).max(11),
});

function parseId(idStr: string): number | null {
  const id = Number(idStr);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function subjectExists(
  subjectType: SentimentSubjectType,
  id: number,
): Promise<boolean> {
  if (subjectType === "bet") {
    return (await prisma.bet.count({ where: { id } })) > 0;
  }
  return (await prisma.market.count({ where: { id } })) > 0;
}

async function validateOutcomeIndex(
  subjectType: SentimentSubjectType,
  subjectId: number,
  outcomeIndex: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (subjectType === "bet") {
    const bet = await prisma.bet.findUnique({
      where: { id: subjectId },
      select: { outcomes: true },
    });
    if (!bet) return { ok: false, reason: "not found" };
    const outcomes = Array.isArray(bet.outcomes)
      ? (bet.outcomes as unknown as string[])
      : [];
    if (outcomeIndex < 0 || outcomeIndex >= outcomes.length) {
      return { ok: false, reason: "invalid outcome" };
    }
    return { ok: true };
  }

  const outcome = await prisma.marketOutcome.findUnique({
    where: { marketId_index: { marketId: subjectId, index: outcomeIndex } },
    select: { index: true },
  });
  if (!outcome) return { ok: false, reason: "invalid outcome" };
  return { ok: true };
}

async function loadSummary(
  subjectType: SentimentSubjectType,
  subjectId: number,
  viewer?: string | null,
): Promise<SentimentSummary> {
  const [groups, mine] = await Promise.all([
    prisma.sentimentVote.groupBy({
      by: ["outcomeIndex"],
      where: { subjectType, subjectId },
      _count: { _all: true },
    }),
    viewer
      ? prisma.sentimentVote.findUnique({
          where: {
            subjectType_subjectId_voter: {
              subjectType,
              subjectId,
              voter: getAddress(viewer),
            },
          },
          select: { outcomeIndex: true },
        })
      : Promise.resolve(null),
  ]);

  const counts = groups
    .map((g) => ({ index: g.outcomeIndex, count: g._count._all }))
    .sort((a, b) => a.index - b.index);
  const totalVotes = counts.reduce((sum, c) => sum + c.count, 0);

  return {
    totalVotes,
    counts,
    yourVote: mine?.outcomeIndex ?? null,
  };
}

/** GET — public sentiment tallies; optional `?viewer=0x..` for the caller's vote. */
export async function handleGetSentiment(
  req: NextRequest,
  subjectType: SentimentSubjectType,
  idStr: string,
) {
  const id = parseId(idStr);
  if (id === null) return jsonErr("bad id", 400);
  if (!(await subjectExists(subjectType, id))) {
    return jsonErr("not found", 404);
  }

  const viewer = req.nextUrl.searchParams.get("viewer");
  if (viewer && !isAddress(viewer)) return jsonErr("bad viewer", 400);

  const summary = await loadSummary(subjectType, id, viewer);
  return jsonOk(summary);
}

/** POST — cast or change sentiment vote (Privy-authed, one vote per wallet). */
export async function handlePostSentiment(
  req: NextRequest,
  subjectType: SentimentSubjectType,
  idStr: string,
) {
  const id = parseId(idStr);
  if (id === null) return jsonErr("bad id", 400);
  if (!(await subjectExists(subjectType, id))) {
    return jsonErr("not found", 404);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = VoteSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }

  const voter = getAddress(parsed.data.voter);
  const auth = await verifyWalletAuth({ req, address: voter });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const valid = await validateOutcomeIndex(
    subjectType,
    id,
    parsed.data.outcomeIndex,
  );
  if (!valid.ok) {
    return jsonErr(valid.reason, valid.reason === "not found" ? 404 : 400);
  }

  await prisma.sentimentVote.upsert({
    where: {
      subjectType_subjectId_voter: {
        subjectType,
        subjectId: id,
        voter,
      },
    },
    create: {
      subjectType,
      subjectId: id,
      voter,
      outcomeIndex: parsed.data.outcomeIndex,
    },
    update: { outcomeIndex: parsed.data.outcomeIndex },
  });

  const summary = await loadSummary(subjectType, id, voter);
  return jsonOk(summary);
}
