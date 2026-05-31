import { NextRequest } from "next/server";
import { z } from "zod";
import { getAddress, isAddress, keccak256, toBytes } from "viem";

import { isAdminAddress } from "@/lib/admin";
import {
  getMarketCollateralToken,
  getTokenByAddress,
} from "@/lib/chains";
import { prisma } from "@/lib/db";
import { getPlatformSettings } from "@/lib/platformSettings";
import { isAllowedImageUrl } from "@/lib/profile";
import { jsonErr, jsonOk } from "@/lib/serialize";
import {
  marketForApi,
  marketWithOutcomesSelect,
} from "@/lib/marketPrisma";
import { getApprovedSettler } from "@/lib/settlers";

export const dynamic = "force-dynamic";

const HEX64 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^[0-9]+$/;

// Markets are fully off-chain now (custodial engine + ledger). The legacy
// on-chain address columns are retained for schema stability; new markets store
// this sentinel so the (chainId, exchangeAddress, conditionId) key stays unique
// on the random conditionId alone.
const OFFCHAIN_SENTINEL = "0x0000000000000000000000000000000000000000";

const CreateMarketSchema = z.object({
  chainId: z.number().int().positive(),
  conditionId: z.string().regex(HEX64, "conditionId must be 0x + 64 hex"),
  questionId: z.string().regex(HEX64, "questionId must be 0x + 64 hex"),

  creator: z.string().refine(isAddress, "bad creator"),
  settler: z.string().refine(isAddress, "bad settler"),
  token: z.string().refine(isAddress, "bad token"),
  tokenSymbol: z.string().max(16).optional(),
  decimals: z.number().int().min(0).max(36),

  title: z.string().min(3).max(200),
  description: z.string().min(1).max(2000),
  imageUrl: z
    .string()
    .url()
    .max(500)
    .refine((u) => isAllowedImageUrl(u), "invalid image url")
    .nullable()
    .optional(),
  terms: z.string().min(1).max(10_000),
  termsHash: z.string().regex(HEX64, "termsHash must be 0x + 64 hex"),
  nonce: z.string().min(1).max(80),

  outcomes: z.array(z.string().min(1).max(80)).min(2).max(16),
  positionIds: z.array(z.string().regex(DECIMAL)).min(2).max(16),

  estimatedEndDate: z.number().int().min(0).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }

  const parsed = CreateMarketSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const d = parsed.data;

  const platform = await getPlatformSettings();
  if (!platform.allowMarketCreation && !isAdminAddress(d.creator)) {
    return jsonErr("Market creation is temporarily disabled", 403);
  }

  if (d.outcomes.length !== d.positionIds.length) {
    return jsonErr("outcomes and positionIds length mismatch", 400);
  }

  // termsHash commitment over the off-chain content.
  const expected = keccak256(
    toBytes(
      JSON.stringify({
        title: d.title.trim(),
        description: d.description.trim(),
        terms: d.terms.trim(),
        creator: d.creator.toLowerCase(),
        nonce: d.nonce,
        outcomes: d.outcomes.map((o) => o.trim()),
      }),
    ),
  );
  if (expected.toLowerCase() !== d.termsHash.toLowerCase()) {
    return jsonErr("termsHash does not match content", 400);
  }

  // Settler must be approved and not the creator.
  if (getAddress(d.settler) === getAddress(d.creator)) {
    return jsonErr("you can't be your own settler", 400);
  }
  const approved = await getApprovedSettler(d.settler);
  if (!approved) return jsonErr("settler is not approved", 400);

  const marketCollateral = getMarketCollateralToken(d.chainId);
  const submittedToken = getTokenByAddress(d.chainId, getAddress(d.token));
  if (
    !submittedToken ||
    submittedToken.address.toLowerCase() !==
      marketCollateral.address.toLowerCase()
  ) {
    return jsonErr("markets must use USDC.e collateral only", 400);
  }

  try {
    const market = await prisma.market.upsert({
      where: {
        chainId_exchangeAddress_conditionId: {
          chainId: d.chainId,
          exchangeAddress: OFFCHAIN_SENTINEL,
          conditionId: d.conditionId.toLowerCase(),
        },
      },
      update: {},
      create: {
        chainId: d.chainId,
        exchangeAddress: OFFCHAIN_SENTINEL,
        ctfAddress: OFFCHAIN_SENTINEL,
        conditionId: d.conditionId.toLowerCase(),
        questionId: d.questionId.toLowerCase(),
        txHash: null,

        creator: getAddress(d.creator),
        settler: getAddress(d.settler),
        feeBps: approved.feeBps,
        token: getAddress(d.token),
        tokenSymbol: d.tokenSymbol,
        decimals: d.decimals,

        title: d.title.trim(),
        description: d.description.trim(),
        imageUrl: d.imageUrl ?? null,
        terms: d.terms.trim(),
        termsHash: d.termsHash.toLowerCase(),
        nonce: d.nonce,

        // New markets are held for admin approval before they go live.
        status: "Pending",
        estimatedEndDate: d.estimatedEndDate
          ? new Date(d.estimatedEndDate * 1000)
          : null,

        outcomes: {
          create: d.outcomes.map((label, i) => ({
            index: i,
            label: label.trim(),
            positionId: d.positionIds[i],
          })),
        },
      },
      select: marketWithOutcomesSelect,
    });

    return jsonOk(marketForApi(market), { status: 201 });
  } catch (err) {
    console.error("create market failed", err);
    return jsonErr("failed to create market", 500);
  }
}

const ListQuerySchema = z.object({
  chainId: z.coerce.number().int().positive().optional(),
  /** Single status or comma-separated list, e.g. `Open,Resolved`. */
  status: z.string().optional(),
  who: z.string().optional(),
  role: z.enum(["creator", "settler", "any"]).optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

const VALID_STATUSES = [
  "Pending",
  "Open",
  "Resolved",
  "Rejected",
  "Removed",
] as const;

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = ListQuerySchema.safeParse(params);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const q = parsed.data;

  const where: Record<string, unknown> = {};
  if (q.chainId) where.chainId = q.chainId;
  if (q.status) {
    const statuses = q.status
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const invalid = statuses.filter(
      (s) => !VALID_STATUSES.includes(s as (typeof VALID_STATUSES)[number]),
    );
    if (invalid.length) {
      return jsonErr(`invalid status: ${invalid.join(", ")}`);
    }
    where.status =
      statuses.length === 1 ? statuses[0] : { in: statuses };
  } else {
    where.status = { not: "Removed" };
  }
  if (q.who && isAddress(q.who)) {
    const addr = getAddress(q.who);
    const role = q.role ?? "any";
    if (role === "creator") where.creator = addr;
    else if (role === "settler") where.settler = addr;
    else where.OR = [{ creator: addr }, { settler: addr }];
  }

  const [rows, total] = await Promise.all([
    prisma.market.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: q.take,
      skip: q.skip,
      select: marketWithOutcomesSelect,
    }),
    prisma.market.count({ where }),
  ]);

  // Compute compact per-outcome quotes (best bid/ask/mid) for card odds from the
  // engine's denormalized OutcomeStat read model (micro prices).
  const ids = rows.map((r) => r.id);
  const [stats, approvedProposals] = await Promise.all([
    ids.length
      ? prisma.outcomeStat.findMany({
          where: { marketId: { in: ids } },
          select: { marketId: true, outcomeIndex: true, bestBid: true, bestAsk: true },
        })
      : Promise.resolve([]),
    // Latest admin-verified outcome per market, so cards can show
    // "verified — awaiting settlement" before the market is resolved.
    ids.length
      ? prisma.resolutionProposal.findMany({
          where: {
            subjectType: "market",
            subjectId: { in: ids },
            status: "Approved",
          },
          orderBy: { createdAt: "desc" },
          select: { subjectId: true, proposedOutcome: true },
        })
      : Promise.resolve([]),
  ]);

  const verifiedByMarket = new Map<number, number>();
  for (const p of approvedProposals) {
    if (!verifiedByMarket.has(p.subjectId)) {
      verifiedByMarket.set(p.subjectId, p.proposedOutcome);
    }
  }

  const levels = new Map<
    number,
    Map<number, { bestBid: number | null; bestAsk: number | null }>
  >();
  for (const s of stats) {
    let byOutcome = levels.get(s.marketId);
    if (!byOutcome) {
      byOutcome = new Map();
      levels.set(s.marketId, byOutcome);
    }
    byOutcome.set(s.outcomeIndex, {
      bestBid: s.bestBid != null ? Number(s.bestBid) / 1_000_000 : null,
      bestAsk: s.bestAsk != null ? Number(s.bestAsk) / 1_000_000 : null,
    });
  }

  const items = rows.map((r) => {
    const byOutcome = levels.get(r.id);
    const quotes = r.outcomes.map((o) => {
      const lvl = byOutcome?.get(o.index);
      const bestBid = lvl?.bestBid ?? null;
      const bestAsk = lvl?.bestAsk ?? null;
      const mid =
        bestBid != null && bestAsk != null
          ? (bestBid + bestAsk) / 2
          : (bestAsk ?? bestBid);
      return { index: o.index, bestBid, bestAsk, mid };
    });
    // Only surface a verified outcome while still open (pre-settlement).
    const verifiedOutcome =
      r.status === "Open" ? verifiedByMarket.get(r.id) ?? null : null;
    return marketForApi(r, { quotes, verifiedOutcome });
  });

  return jsonOk({ items, total });
}
