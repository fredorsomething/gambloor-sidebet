import { NextRequest } from "next/server";
import { z } from "zod";
import { getAddress, isAddress, keccak256, toBytes } from "viem";

import { syncBetsOnchain } from "@/lib/betSync";
import { PUBLIC_BET_FEED_FILTER } from "@/lib/betVisibility";
import { validateAcceptDeadlineUnix } from "@/lib/sidebetExpiry";
import { getMarketCollateralToken, getTokenByAddress } from "@/lib/chains";
import { prisma } from "@/lib/db";
import { isAllowedImageUrl } from "@/lib/profile";
import { jsonErr, jsonOk } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const HEX64 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^[0-9]+$/;

const CreateBetSchema = z.object({
  chainId: z.number().int().positive(),
  escrowAddress: z.string().refine(isAddress, "bad escrow address"),
  onchainId: z.string().regex(DECIMAL, "onchainId must be a uint string"),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),

  proposer: z.string().refine(isAddress, "bad proposer"),
  settler: z.string().refine(isAddress, "bad settler"),
  customSettler: z.string().refine(isAddress, "bad customSettler").optional().nullable(),
  token: z.string().refine(isAddress, "bad token"),
  tokenSymbol: z.string().max(16).optional(),
  decimals: z.number().int().min(0).max(36),

  // Asymmetric stakes.
  proposerStake: z.string().regex(DECIMAL, "proposerStake must be a uint string"),
  acceptorStake: z.string().regex(DECIMAL, "acceptorStake must be a uint string"),

  // Outcomes.
  outcomes: z.array(z.string().min(1).max(80)).min(2).max(16),
  proposerOutcome: z.number().int().min(0).max(15),
  acceptorOutcome: z.number().int().min(0).max(15),

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

  feeBps: z.number().int().min(0).max(1000),
  acceptDeadline: z.number().int().min(0).optional(),
  estimatedEndDate: z.number().int().min(0).optional(), // unix seconds
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }

  const parsed = CreateBetSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const d = parsed.data;

  if (d.proposerOutcome >= d.outcomes.length || d.acceptorOutcome >= d.outcomes.length) {
    return jsonErr("outcome index out of range", 400);
  }
  if (d.proposerOutcome === d.acceptorOutcome) {
    return jsonErr("proposer and acceptor must back different outcomes", 400);
  }

  const sidebetCollateral = getMarketCollateralToken(d.chainId);
  const submittedToken = getTokenByAddress(d.chainId, getAddress(d.token));
  if (
    !submittedToken ||
    submittedToken.address.toLowerCase() !==
      sidebetCollateral.address.toLowerCase()
  ) {
    return jsonErr("sidebets must use USDC.e collateral only", 400);
  }

  // Confirm the off-chain content matches the committed termsHash.
  const expected = keccak256(
    toBytes(
      JSON.stringify({
        title: d.title.trim(),
        description: d.description.trim(),
        terms: d.terms.trim(),
        proposer: d.proposer.toLowerCase(),
        nonce: d.nonce,
        outcomes: d.outcomes.map((o) => o.trim()),
      }),
    ),
  );
  if (expected.toLowerCase() !== d.termsHash.toLowerCase()) {
    return jsonErr("termsHash does not match content", 400);
  }

  const deadline = d.acceptDeadline ?? 0;
  const deadlineErr = validateAcceptDeadlineUnix(deadline);
  if (deadlineErr) return jsonErr(deadlineErr, 400);

  try {
    const bet = await prisma.bet.upsert({
      where: {
        chainId_escrowAddress_onchainId: {
          chainId: d.chainId,
          escrowAddress: getAddress(d.escrowAddress),
          onchainId: d.onchainId,
        },
      },
      update: {
        txHash: d.txHash,
      },
      create: {
        chainId: d.chainId,
        escrowAddress: getAddress(d.escrowAddress),
        onchainId: d.onchainId,
        txHash: d.txHash,

        proposer: getAddress(d.proposer),
        settler: getAddress(d.settler),
        customSettler: d.customSettler ? getAddress(d.customSettler) : null,
        token: getAddress(d.token),
        tokenSymbol: d.tokenSymbol,
        decimals: d.decimals,

        amount: d.proposerStake,
        proposerStake: d.proposerStake,
        acceptorStake: d.acceptorStake,

        outcomes: d.outcomes.map((o) => o.trim()),
        proposerOutcome: d.proposerOutcome,
        acceptorOutcome: d.acceptorOutcome,

        title: d.title.trim(),
        description: d.description.trim(),
        imageUrl: d.imageUrl ?? null,
        terms: d.terms.trim(),
        termsHash: d.termsHash.toLowerCase(),
        nonce: d.nonce,

        feeBps: d.feeBps,
        acceptDeadline:
          deadline > 0 ? BigInt(deadline) : null,
        estimatedEndDate: d.estimatedEndDate
          ? new Date(d.estimatedEndDate * 1000)
          : null,

        status: "Open",
      },
    });

    return jsonOk(bet, { status: 201 });
  } catch (err) {
    console.error("create bet failed", err);
    return jsonErr("failed to create bet", 500);
  }
}

const ListQuerySchema = z.object({
  chainId: z.coerce.number().int().positive().optional(),
  /** Single status or comma-separated list, e.g. `Open,Matched`. */
  status: z.string().optional(),
  who: z.string().optional(), // address — proposer/acceptor/settler
  role: z.enum(["proposer", "acceptor", "settler", "any"]).optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

const VALID_STATUSES = [
  "Open",
  "Matched",
  "Settled",
  "Cancelled",
  "Refunded",
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

  let statusFilter: Record<string, unknown> | null = null;
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
    if (statuses.length === 1 && statuses[0] === "Open") {
      // Keep negotiated escrow refreshes visible even if the old on-chain id was
      // briefly synced to Cancelled mid-revision.
      statusFilter = {
        OR: [{ status: "Open" }, { escrowRevisionNeeded: true }],
      };
    } else {
      statusFilter = {
        status: statuses.length === 1 ? statuses[0] : { in: statuses },
      };
    }
  }

  if (q.who && isAddress(q.who)) {
    const addr = getAddress(q.who);
    const role = q.role ?? "any";
    const participantFilter =
      role === "proposer"
        ? { proposer: addr }
        : role === "acceptor"
          ? { acceptor: addr }
          : role === "settler"
            ? { settler: addr }
            : {
                OR: [
                  { proposer: addr },
                  { acceptor: addr },
                  { settler: addr },
                ],
              };
    if (statusFilter) {
      where.AND = [statusFilter, participantFilter];
    } else {
      Object.assign(where, participantFilter);
    }
  } else if (statusFilter) {
    Object.assign(where, statusFilter);
  }

  if (!q.who || !isAddress(q.who)) {
    where.hiddenFromFeed = PUBLIC_BET_FEED_FILTER.hiddenFromFeed;
    // Public feed: hide open offers past their accept window (and indexed expired).
    const nowSec = Math.floor(Date.now() / 1000);
    where.NOT = {
      OR: [
        { status: "Expired" },
        {
          AND: [
            { status: "Open" },
            { acceptDeadline: { not: null, lt: BigInt(nowSec) } },
          ],
        },
      ],
    };
  }

  const [rows, total] = await Promise.all([
    prisma.bet.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: q.take,
      skip: q.skip,
    }),
    prisma.bet.count({ where }),
  ]);

  // Opportunistically refresh non-terminal bets from chain so matches/settles
  // show up in feeds and "my bets" without waiting for someone to open the
  // detail page. Throttled per-bet (see betSync) to keep RPC usage bounded.
  const items = await syncBetsOnchain(rows);

  return jsonOk({ items, total });
}
