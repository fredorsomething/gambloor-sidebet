import { NextRequest } from "next/server";
import { z } from "zod";
import { getAddress, isAddress, keccak256, toBytes } from "viem";

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
        acceptDeadline: d.acceptDeadline ? BigInt(d.acceptDeadline) : null,
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
  }
  if (q.who && isAddress(q.who)) {
    const addr = getAddress(q.who);
    const role = q.role ?? "any";
    if (role === "proposer") where.proposer = addr;
    else if (role === "acceptor") where.acceptor = addr;
    else if (role === "settler") where.settler = addr;
    else
      where.OR = [
        { proposer: addr },
        { acceptor: addr },
        { settler: addr },
      ];
  } else {
    // Public feed: hide open offers that expired without a taker. New bets carry
    // a 1-week acceptDeadline; older ones fall back to created + 1 week. Personal
    // ("who") views still show them so the proposer can reclaim their stake.
    const nowSec = Math.floor(Date.now() / 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    where.NOT = {
      AND: [
        { status: "Open" },
        {
          OR: [
            { acceptDeadline: { lt: BigInt(nowSec) } },
            { AND: [{ acceptDeadline: null }, { createdAt: { lt: weekAgo } }] },
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

  return jsonOk({ items: rows, total });
}
