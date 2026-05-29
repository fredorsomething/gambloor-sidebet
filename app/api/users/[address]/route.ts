import { NextRequest } from "next/server";
import { z } from "zod";
import { getAddress, isAddress } from "viem";

import { verifyProfileAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAllowedAvatarUrl } from "@/lib/profile";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { computeUserStats, type StatBet } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } },
) {
  if (!isAddress(params.address)) return jsonErr("bad address", 400);
  const address = getAddress(params.address);

  const [user, bets] = await Promise.all([
    prisma.user.findUnique({ where: { address } }),
    prisma.bet.findMany({
      where: {
        OR: [{ proposer: address }, { acceptor: address }],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const statBets: StatBet[] = bets.map((b) => ({
    proposer: b.proposer,
    acceptor: b.acceptor,
    amount: b.amount,
    decimals: b.decimals,
    feeBps: b.feeBps,
    status: b.status,
    winner: b.winner,
  }));
  const stats = computeUserStats(statBets, address);

  return jsonOk({
    user: {
      address,
      username: user?.username ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      bio: user?.bio ?? null,
      joinedAt: user?.createdAt ?? null,
    },
    stats,
    bets,
  });
}

const PutSchema = z.object({
  message: z.string().min(1),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  username: z
    .string()
    .regex(/^[a-zA-Z0-9_]{3,20}$/)
    .nullable()
    .optional(),
  avatarUrl: z
    .string()
    .url()
    .max(500)
    .refine((u) => isAllowedAvatarUrl(u), "invalid avatar url")
    .nullable()
    .optional(),
  bio: z.string().max(280).nullable().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: { address: string } },
) {
  if (!isAddress(params.address)) return jsonErr("bad address", 400);
  const address = getAddress(params.address);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("invalid json");
  }
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return jsonErr(parsed.error.errors.map((e) => e.message).join(", "));
  }
  const d = parsed.data;

  const auth = await verifyProfileAuth({
    address,
    message: d.message,
    signature: d.signature,
  });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  // Enforce unique username (case-insensitive-ish: stored as provided).
  if (d.username) {
    const existing = await prisma.user.findUnique({
      where: { username: d.username },
    });
    if (existing && existing.address.toLowerCase() !== address.toLowerCase()) {
      return jsonErr("username already taken", 409);
    }
  }

  const user = await prisma.user.upsert({
    where: { address },
    update: {
      username: d.username ?? null,
      avatarUrl: d.avatarUrl ?? null,
      bio: d.bio ?? null,
    },
    create: {
      address,
      username: d.username ?? null,
      avatarUrl: d.avatarUrl ?? null,
      bio: d.bio ?? null,
    },
  });

  return jsonOk({
    address: user.address,
    username: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
  });
}
