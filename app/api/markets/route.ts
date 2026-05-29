import { NextRequest } from "next/server";
import { z } from "zod";
import { getAddress, isAddress, keccak256, toBytes } from "viem";

import { prisma } from "@/lib/db";
import { isAllowedImageUrl } from "@/lib/profile";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { getApprovedSettler } from "@/lib/settlers";

export const dynamic = "force-dynamic";

const HEX64 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^[0-9]+$/;

const CreateMarketSchema = z.object({
  chainId: z.number().int().positive(),
  exchangeAddress: z.string().refine(isAddress, "bad exchange address"),
  ctfAddress: z.string().refine(isAddress, "bad ctf address"),
  conditionId: z.string().regex(HEX64, "conditionId must be 0x + 64 hex"),
  questionId: z.string().regex(HEX64, "questionId must be 0x + 64 hex"),
  txHash: z.string().regex(HEX64).optional(),

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

  try {
    const market = await prisma.market.upsert({
      where: {
        chainId_exchangeAddress_conditionId: {
          chainId: d.chainId,
          exchangeAddress: getAddress(d.exchangeAddress),
          conditionId: d.conditionId.toLowerCase(),
        },
      },
      update: { txHash: d.txHash },
      create: {
        chainId: d.chainId,
        exchangeAddress: getAddress(d.exchangeAddress),
        ctfAddress: getAddress(d.ctfAddress),
        conditionId: d.conditionId.toLowerCase(),
        questionId: d.questionId.toLowerCase(),
        txHash: d.txHash,

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

        status: "Open",
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
      include: { outcomes: true },
    });

    return jsonOk(market, { status: 201 });
  } catch (err) {
    console.error("create market failed", err);
    return jsonErr("failed to create market", 500);
  }
}

const ListQuerySchema = z.object({
  chainId: z.coerce.number().int().positive().optional(),
  status: z.enum(["Open", "Resolved"]).optional(),
  who: z.string().optional(),
  role: z.enum(["creator", "settler", "any"]).optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = ListQuerySchema.safeParse(params);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const q = parsed.data;

  const where: Record<string, unknown> = {};
  if (q.chainId) where.chainId = q.chainId;
  if (q.status) where.status = q.status;
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
      include: { outcomes: { orderBy: { index: "asc" } } },
    }),
    prisma.market.count({ where }),
  ]);

  return jsonOk({ items: rows, total });
}
