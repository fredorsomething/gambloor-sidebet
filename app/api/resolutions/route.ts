import { NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { z } from "zod";

import { isAdminAddress, ADMIN_ADDRESS } from "@/lib/admin";
import { verifyWalletAuth } from "@/lib/auth";
import {
  autoApproveUnanimousBet,
  betPartyRole,
  loadBetResolutionState,
} from "@/lib/betResolution";
import { tryAutoSettleBet } from "@/lib/autoSettle";
import { prisma } from "@/lib/db";
import { notify, notifyMany } from "@/lib/notifications";
import {
  canProposeResolution,
  loadSubject,
  type SubjectType,
} from "@/lib/resolutionSubject";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { shortAddr } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SubjectEnum = z.enum(["bet", "market"]);

/**
 * GET /api/resolutions
 *  - ?subjectType=bet&subjectId=1  → latest proposal for that subject (public)
 *  - ?address=0x..&status=Pending  → admin-only list of proposals to review
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const subjectType = sp.get("subjectType");
  const subjectIdRaw = sp.get("subjectId");

  if (subjectType && subjectIdRaw) {
    const parsedType = SubjectEnum.safeParse(subjectType);
    const subjectId = Number(subjectIdRaw);
    if (!parsedType.success || !Number.isInteger(subjectId) || subjectId <= 0) {
      return jsonErr("bad subject", 400);
    }
    if (parsedType.data === "bet") {
      const bet = await prisma.bet.findUnique({ where: { id: subjectId } });
      if (!bet) return jsonErr("not found", 404);
      const state = await loadBetResolutionState(bet);
      return jsonOk({
        proposer: state.proposer,
        acceptor: state.acceptor,
        consensus: state.consensus,
        agreedOutcome: state.agreedOutcome,
        verifiedOutcome: state.verifiedOutcome,
      });
    }

    const proposal = await prisma.resolutionProposal.findFirst({
      where: { subjectType: parsedType.data, subjectId },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ proposal });
  }

  // Admin list.
  const addrRaw = sp.get("address") ?? "";
  if (!isAddress(addrRaw)) return jsonErr("bad address", 400);
  const address = getAddress(addrRaw);
  if (!isAdminAddress(address)) return jsonErr("forbidden", 403);

  const auth = await verifyWalletAuth({ req, address });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const status = sp.get("status") ?? "Pending";
  const proposals = await prisma.resolutionProposal.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Enrich with subject title/link/outcomes for the dashboard.
  const enriched = await Promise.all(
    proposals.map(async (p) => {
      const subject = await loadSubject(
        p.subjectType as SubjectType,
        p.subjectId,
      );
      return {
        ...p,
        subjectTitle: subject?.title ?? `#${p.subjectId}`,
        subjectLink: subject?.link ?? null,
        outcomeLabel:
          subject?.outcomes?.[p.proposedOutcome] ?? `Outcome ${p.proposedOutcome}`,
      };
    }),
  );

  return jsonOk({ proposals: enriched });
}

const PostSchema = z.object({
  proposedBy: z.string().refine(isAddress, "bad address"),
  subjectType: SubjectEnum,
  subjectId: z.number().int().positive(),
  proposedOutcome: z.number().int().min(0).max(31),
  note: z.string().trim().max(500).optional(),
});

/** POST /api/resolutions — propose a resolution; routes to admin for review. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const d = parsed.data;
  const proposer = getAddress(d.proposedBy);

  const auth = await verifyWalletAuth({ req, address: proposer });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  const subject = await loadSubject(d.subjectType, d.subjectId);
  if (!subject) return jsonErr("subject not found", 404);
  if (d.proposedOutcome >= subject.outcomes.length) {
    return jsonErr("invalid outcome", 400);
  }

  const allowed = await canProposeResolution(
    d.subjectType,
    d.subjectId,
    proposer,
  );
  if (!allowed) {
    return jsonErr("only participants can propose a resolution", 403);
  }

  const outcomeLabel =
    subject.outcomes[d.proposedOutcome] ?? `Outcome ${d.proposedOutcome}`;

  // Sidebets: each bettor declares independently; unanimous = auto-approve.
  if (d.subjectType === "bet") {
    const bet = await prisma.bet.findUnique({ where: { id: d.subjectId } });
    if (!bet) return jsonErr("subject not found", 404);
    if (bet.status !== "Matched") {
      return jsonErr("bet must be matched before declaring an outcome", 409);
    }
    const role = betPartyRole(bet, proposer);
    if (!role) {
      return jsonErr("only the proposer or acceptor can declare an outcome", 403);
    }

    const prior = await prisma.resolutionProposal.findFirst({
      where: {
        subjectType: "bet",
        subjectId: d.subjectId,
        proposedBy: proposer.toLowerCase(),
      },
      orderBy: { createdAt: "desc" },
    });

    const proposal = prior
      ? await prisma.resolutionProposal.update({
          where: { id: prior.id },
          data: {
            proposedOutcome: d.proposedOutcome,
            note: d.note ?? null,
            status: "Pending",
            reviewedBy: null,
            reviewNote: null,
          },
        })
      : await prisma.resolutionProposal.create({
          data: {
            subjectType: "bet",
            subjectId: d.subjectId,
            proposedBy: proposer.toLowerCase(),
            proposedOutcome: d.proposedOutcome,
            note: d.note ?? null,
            status: "Pending",
          },
        });

    // Changing one side's call invalidates any prior auto-approval on the other.
    await prisma.resolutionProposal.updateMany({
      where: {
        subjectType: "bet",
        subjectId: d.subjectId,
        proposedBy: { not: proposer.toLowerCase() },
        status: "Approved",
        reviewedBy: "system",
      },
      data: {
        status: "Pending",
        reviewedBy: null,
        reviewNote: null,
      },
    });

    const state = await loadBetResolutionState(bet);

    if (state.consensus === "unanimous" && state.agreedOutcome != null) {
      await autoApproveUnanimousBet(d.subjectId, state.agreedOutcome);
      const settleResult = await tryAutoSettleBet(d.subjectId).catch((err) => {
        console.error("auto-settle failed", err);
        return { ok: false as const, betId: d.subjectId, reason: "auto-settle error" };
      });
      if (settleResult.ok) {
        console.log(
          `auto-settle triggered for bet #${d.subjectId}: ${settleResult.hash}`,
        );
      } else if (settleResult.reason !== "SETTLER_PRIVATE_KEY not configured") {
        console.warn(
          `auto-settle skipped for bet #${d.subjectId}: ${settleResult.reason}`,
        );
      }
      await notify({
        recipient: bet.settler.toLowerCase(),
        type: "resolution_verified",
        title: "Both sides agree — settling",
        body: `Proposer and acceptor declared "${outcomeLabel}" for ${subject.title}. Payout is being finalized on-chain.`,
        link: subject.link,
      });
      return jsonOk(
        {
          proposal,
          unanimous: true,
          agreedOutcome: state.agreedOutcome,
          autoSettle: settleResult,
        },
        { status: prior ? 200 : 201 },
      );
    }

    if (state.consensus === "disputed") {
      await notify({
        recipient: ADMIN_ADDRESS.toLowerCase(),
        type: "resolution_proposed",
        title: "Disputed sidebet outcome",
        body: `Proposer and acceptor disagree on "${subject.title}" — review required.`,
        link: "/admin",
      });
      return jsonOk({ proposal, disputed: true }, { status: prior ? 200 : 201 });
    }

    const other =
      role === "proposer" ? bet.acceptor?.toLowerCase() : bet.proposer.toLowerCase();
    if (other) {
      await notify({
        recipient: other,
        type: "resolution_proposed",
        title: "Outcome declared on your bet",
        body: `${shortAddr(proposer)} declared "${outcomeLabel}" for ${subject.title}. Declare yours to agree and settle faster.`,
        link: subject.link,
      });
    }

    return jsonOk({ proposal }, { status: prior ? 200 : 201 });
  }

  // Markets: single proposal queue for admin review.
  const existing = await prisma.resolutionProposal.findFirst({
    where: {
      subjectType: d.subjectType,
      subjectId: d.subjectId,
      status: "Pending",
    },
  });
  if (existing) {
    return jsonErr("a resolution is already under review for this", 409);
  }

  const proposal = await prisma.resolutionProposal.create({
    data: {
      subjectType: d.subjectType,
      subjectId: d.subjectId,
      proposedBy: proposer.toLowerCase(),
      proposedOutcome: d.proposedOutcome,
      note: d.note ?? null,
      status: "Pending",
    },
  });

  await notify({
    recipient: ADMIN_ADDRESS.toLowerCase(),
    type: "resolution_proposed",
    title: "New resolution to verify",
    body: `${shortAddr(proposer)} proposed "${outcomeLabel}" for ${subject.title}`,
    link: "/admin",
  });

  return jsonOk({ proposal }, { status: 201 });
}
