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
  amount: z.string().regex(DECIMAL, "amount must be a uint string"),

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
  settleDeadline: z.number().int().min(0).optional(),
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

  // Confirm the off-chain content matches the committed termsHash.
  const expected = keccak256(
    toBytes(
      JSON.stringify({
        title: d.title.trim(),
        description: d.description.trim(),
        terms: d.terms.trim(),
        proposer: d.proposer.toLowerCase(),
        nonce: d.nonce,
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
        amount: d.amount,

        title: d.title.trim(),
        description: d.description.trim(),
        imageUrl: d.imageUrl ?? null,
        terms: d.terms.trim(),
        termsHash: d.termsHash.toLowerCase(),
        nonce: d.nonce,

        feeBps: d.feeBps,
        acceptDeadline: d.acceptDeadline ? BigInt(d.acceptDeadline) : null,
        settleDeadline: d.settleDeadline ? BigInt(d.settleDeadline) : null,

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
  status: z
    .enum(["Open", "Matched", "Settled", "Cancelled", "Refunded"])
    .optional(),
  who: z.string().optional(), // address — proposer/acceptor/settler
  role: z.enum(["proposer", "acceptor", "settler", "any"]).optional(),
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
    if (role === "proposer") where.proposer = addr;
    else if (role === "acceptor") where.acceptor = addr;
    else if (role === "settler") where.settler = addr;
    else
      where.OR = [
        { proposer: addr },
        { acceptor: addr },
        { settler: addr },
      ];
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
