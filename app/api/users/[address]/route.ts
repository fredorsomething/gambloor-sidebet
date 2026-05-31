import { NextRequest } from "next/server";
import { z } from "zod";
import { getAddress, isAddress } from "viem";

import { resolveDisplayBadges } from "@/lib/badges";
import { verifyWalletAuth } from "@/lib/auth";
import { syncUserParticipantBets } from "@/lib/betSync";
import { prisma } from "@/lib/db";
import { isAllowedAvatarUrl } from "@/lib/profile";
import { getProfileViewCount } from "@/lib/profileViews";
import { jsonErr, jsonOk } from "@/lib/serialize";
import { computeUserStats, type StatBet } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } },
) {
  // The handle can be a wallet address or an @username (with or without "@").
  const handle = decodeURIComponent(params.address).trim().replace(/^@/, "");

  let address: string;
  let user;
  if (isAddress(handle)) {
    address = getAddress(handle);
    user = await prisma.user.findUnique({ where: { address } });
  } else {
    user = await prisma.user.findFirst({
      where: { username: { equals: handle, mode: "insensitive" } },
    });
    if (!user) {
      // Fall back to a former username so old links keep resolving to the same
      // wallet after a rename. Current usernames always win (checked above).
      const past = await prisma.usernameHistory.findFirst({
        where: { username: handle.toLowerCase() },
        orderBy: { createdAt: "desc" },
      });
      if (!past) return jsonErr("user not found", 404);
      address = getAddress(past.address);
      user = await prisma.user.findUnique({ where: { address } });
    } else {
      address = getAddress(user.address);
    }
  }

  // Match by address case-insensitively so no on-chain activity is ever missed
  // due to checksum casing differences. Identity is the wallet, not the name.
  await syncUserParticipantBets(address).catch((err) => {
    console.error("syncUserParticipantBets failed", address, err);
  });

  const bets = await prisma.bet.findMany({
    where: {
      OR: [
        { proposer: { equals: address, mode: "insensitive" } },
        { acceptor: { equals: address, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

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

  // CLOB markets this user created. Select only fields we return so profile
  // loads stay up when the DB lags behind schema migrations.
  const createdMarkets = await prisma.market.findMany({
    where: { creator: { equals: address, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      imageUrl: true,
      status: true,
      tokenSymbol: true,
      feeBps: true,
      _count: { select: { outcomes: true } },
    },
  });
  const markets = createdMarkets.map((m) => ({
    id: m.id,
    title: m.title,
    imageUrl: m.imageUrl,
    status: m.status,
    tokenSymbol: m.tokenSymbol,
    feeBps: m.feeBps,
    outcomeCount: m._count.outcomes,
  }));

  const views = await getProfileViewCount(address);

  return jsonOk({
    user: {
      address,
      username: user?.username ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      bio: user?.bio ?? null,
      twitter: user?.twitter ?? null,
      discord: user?.discord ?? null,
      verified: user?.verified ?? false,
      badges: resolveDisplayBadges(user?.badges, address),
      joinedAt: user?.createdAt ?? null,
      views,
    },
    stats,
    bets,
    markets,
  });
}

const PutSchema = z.object({
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
  twitter: z.string().max(100).nullable().optional(),
  discord: z.string().max(100).nullable().optional(),
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

  const auth = await verifyWalletAuth({ req, address });
  if (!auth.ok) return jsonErr(auth.error, auth.status);

  // Enforce unique username, case-insensitively.
  if (d.username) {
    const existing = await prisma.user.findFirst({
      where: { username: { equals: d.username, mode: "insensitive" } },
    });
    if (existing && existing.address.toLowerCase() !== address.toLowerCase()) {
      return jsonErr("username already taken", 409);
    }
  }

  // Record the previous username so its old `/u/<name>` links keep resolving to
  // this wallet. All stats stay keyed to the (immutable) address regardless.
  const prior = await prisma.user.findUnique({ where: { address } });
  const oldUsername = prior?.username?.trim();
  const newUsername = d.username?.trim() || null;
  if (oldUsername && oldUsername.toLowerCase() !== newUsername?.toLowerCase()) {
    await prisma.usernameHistory
      .upsert({
        where: {
          username_address: { username: oldUsername.toLowerCase(), address },
        },
        update: { createdAt: new Date() },
        create: { username: oldUsername.toLowerCase(), address },
      })
      .catch(() => {});
  }

  const user = await prisma.user.upsert({
    where: { address },
    update: {
      privyId: auth.userId,
      email: auth.email,
      username: d.username ?? null,
      avatarUrl: d.avatarUrl ?? null,
      bio: d.bio ?? null,
      twitter: d.twitter ?? null,
      discord: d.discord ?? null,
    },
    create: {
      address,
      privyId: auth.userId,
      email: auth.email,
      username: d.username ?? null,
      avatarUrl: d.avatarUrl ?? null,
      bio: d.bio ?? null,
      twitter: d.twitter ?? null,
      discord: d.discord ?? null,
    },
  });

  return jsonOk({
    address: user.address,
    username: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    twitter: user.twitter,
    discord: user.discord,
  });
}
