import { getAddress } from "viem";

import { prisma } from "@/lib/db";

export const REFERRAL_SHARE_BPS = 3500; // 35% of platform fees
export const MAX_CAMPAIGNS_PER_USER = 3;
export const REFERRAL_STORAGE_KEY = "sb_ref";

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "create",
  "me",
  "referrals",
  "terms",
  "privacy",
  "swap",
  "leaderboard",
  "users",
  "markets",
  "messages",
  "profile",
  "search",
  "bets",
  "how-it-works",
  "opengraph-image",
]);

export function normalizeReferralSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "");
}

export function isValidReferralSlug(slug: string): boolean {
  if (slug.length < 3 || slug.length > 32) return false;
  if (!/^[a-z0-9-]+$/.test(slug)) return false;
  if (slug.startsWith("-") || slug.endsWith("-")) return false;
  if (slug.includes("--")) return false;
  return !RESERVED_SLUGS.has(slug);
}

export function referralLink(slug: string): string {
  return `/?r=${encodeURIComponent(slug)}`;
}

function shareMicro(feeMicro: bigint): bigint {
  return (feeMicro * BigInt(REFERRAL_SHARE_BPS)) / 10_000n;
}

export async function getAttributionForUser(
  address: string,
): Promise<{ campaignId: number; referrer: string; slug: string } | null> {
  const referred = address.toLowerCase();
  const row = await prisma.referralAttribution.findUnique({
    where: { referred },
    include: { campaign: { select: { owner: true, slug: true } } },
  });
  if (!row) return null;
  return {
    campaignId: row.campaignId,
    referrer: row.campaign.owner,
    slug: row.campaign.slug,
  };
}

/** Attribute a wallet to a campaign slug (first touch, one lifetime). */
export async function attributeReferral(
  referredAddress: string,
  slugRaw: string,
): Promise<{ ok: true; attributed: boolean } | { ok: false; error: string }> {
  const slug = normalizeReferralSlug(slugRaw);
  if (!isValidReferralSlug(slug)) {
    return { ok: false, error: "invalid referral code" };
  }

  const referred = getAddress(referredAddress).toLowerCase();
  const existing = await prisma.referralAttribution.findUnique({
    where: { referred },
  });
  if (existing) return { ok: true, attributed: false };

  const campaign = await prisma.referralCampaign.findUnique({ where: { slug } });
  if (!campaign) return { ok: false, error: "referral code not found" };
  if (campaign.owner === referred) {
    return { ok: false, error: "cannot refer yourself" };
  }

  await prisma.referralAttribution.create({
    data: { campaignId: campaign.id, referred },
  });
  return { ok: true, attributed: true };
}

export async function createReferralCampaign(
  ownerAddress: string,
  slugRaw: string,
  label?: string | null,
): Promise<
  | { ok: true; campaign: { id: number; slug: string; label: string | null } }
  | { ok: false; error: string }
> {
  const owner = getAddress(ownerAddress).toLowerCase();
  const slug = normalizeReferralSlug(slugRaw);
  if (!isValidReferralSlug(slug)) {
    return { ok: false, error: "code must be 3–32 letters, numbers, or hyphens" };
  }

  const count = await prisma.referralCampaign.count({ where: { owner } });
  if (count >= MAX_CAMPAIGNS_PER_USER) {
    return { ok: false, error: `maximum ${MAX_CAMPAIGNS_PER_USER} campaigns per account` };
  }

  const taken = await prisma.referralCampaign.findUnique({ where: { slug } });
  if (taken) return { ok: false, error: "that referral code is already taken" };

  const campaign = await prisma.referralCampaign.create({
    data: {
      owner,
      slug,
      label: label?.trim() || null,
    },
    select: { id: true, slug: true, label: true },
  });
  return { ok: true, campaign };
}

async function recordEarning(args: {
  campaignId: number;
  referrer: string;
  referred: string;
  source: "sidebet" | "clob";
  sourceId: string;
  feeMicro: bigint;
}): Promise<void> {
  if (args.feeMicro <= 0n) return;
  const share = shareMicro(args.feeMicro);
  if (share <= 0n) return;

  await prisma.referralEarning
    .create({
      data: {
        campaignId: args.campaignId,
        referrer: args.referrer,
        referred: args.referred,
        source: args.source,
        sourceId: args.sourceId,
        feeMicro: args.feeMicro,
        shareMicro: share,
      },
    })
    .catch((err: unknown) => {
      if (
        typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === "P2002"
      ) {
        return;
      }
      throw err;
    });
}

/** Credit referrer when a sidebet settles (fee share per referred participant). */
export async function creditReferralForSidebet(betId: number): Promise<void> {
  const bet = await prisma.bet.findUnique({
    where: { id: betId },
    select: {
      proposer: true,
      acceptor: true,
      proposerStake: true,
      acceptorStake: true,
      amount: true,
      feeBps: true,
      status: true,
    },
  });
  if (!bet || bet.status !== "Settled" || !bet.acceptor) return;

  const proposerStake = BigInt(bet.proposerStake !== "0" ? bet.proposerStake : bet.amount);
  const acceptorStake = BigInt(bet.acceptorStake !== "0" ? bet.acceptorStake : bet.amount);
  const pool = proposerStake + acceptorStake;
  if (pool <= 0n) return;

  const totalFee = (pool * BigInt(bet.feeBps)) / 10_000n;
  if (totalFee <= 0n) return;

  const proposerFee = (totalFee * proposerStake) / pool;
  const acceptorFee = totalFee - proposerFee;

  const parties = [
    { addr: bet.proposer.toLowerCase(), fee: proposerFee, suffix: "p" },
    { addr: bet.acceptor.toLowerCase(), fee: acceptorFee, suffix: "a" },
  ];

  for (const party of parties) {
    if (party.fee <= 0n) continue;
    const attr = await prisma.referralAttribution.findUnique({
      where: { referred: party.addr },
      include: { campaign: true },
    });
    if (!attr) continue;
    await recordEarning({
      campaignId: attr.campaignId,
      referrer: attr.campaign.owner,
      referred: party.addr,
      source: "sidebet",
      sourceId: `${betId}:${party.suffix}`,
      feeMicro: party.fee,
    });
  }
}

/** Credit referrer for a CLOB fill taker fee. */
export async function creditReferralForClobFill(fillId: number): Promise<void> {
  const fill = await prisma.fill.findUnique({
    where: { id: fillId },
    select: { taker: true, takerFee: true },
  });
  if (!fill || fill.takerFee <= 0n) return;

  const attr = await prisma.referralAttribution.findUnique({
    where: { referred: fill.taker.toLowerCase() },
    include: { campaign: true },
  });
  if (!attr) return;

  await recordEarning({
    campaignId: attr.campaignId,
    referrer: attr.campaign.owner,
    referred: fill.taker.toLowerCase(),
    source: "clob",
    sourceId: String(fillId),
    feeMicro: fill.takerFee,
  });
}

function stakeDollars(raw: string, fallback: string, decimals: number): number {
  try {
    const wei = BigInt(raw !== "0" ? raw : fallback);
    return Number(wei) / 10 ** decimals;
  } catch {
    return 0;
  }
}

async function referredUserVolume(referred: string): Promise<{
  volumeUsd: number;
  feesPaidMicro: bigint;
}> {
  const lower = referred.toLowerCase();

  const [bets, fills, earnings] = await Promise.all([
    prisma.bet.findMany({
      where: {
        status: { in: ["Matched", "Settled"] },
        OR: [
          { proposer: { equals: lower, mode: "insensitive" } },
          { acceptor: { equals: lower, mode: "insensitive" } },
        ],
      },
      select: {
        proposer: true,
        acceptor: true,
        amount: true,
        proposerStake: true,
        acceptorStake: true,
        decimals: true,
      },
    }),
    prisma.fill.findMany({
      where: { OR: [{ taker: lower }, { maker: lower }] },
      select: { takerCost: true, makerCost: true },
    }),
    prisma.referralEarning.findMany({
      where: { referred: lower },
      select: { feeMicro: true },
    }),
  ]);

  let volumeUsd = 0;
  for (const b of bets) {
    const isProposer = b.proposer.toLowerCase() === lower;
    volumeUsd += stakeDollars(
      isProposer ? b.proposerStake : b.acceptorStake,
      b.amount,
      b.decimals,
    );
  }
  for (const f of fills) {
    volumeUsd += Number(f.takerCost + f.makerCost) / 1_000_000;
  }

  const feesPaidMicro = earnings.reduce((sum, e) => sum + e.feeMicro, 0n);
  return { volumeUsd, feesPaidMicro };
}

export async function getReferralDashboard(ownerAddress: string) {
  const owner = getAddress(ownerAddress).toLowerCase();

  const campaigns = await prisma.referralCampaign.findMany({
    where: { owner },
    orderBy: { createdAt: "asc" },
    include: {
      referrals: { orderBy: { createdAt: "desc" } },
      _count: { select: { referrals: true } },
    },
  });

  const [pendingAgg, collectedAgg, earningsByCampaign] = await Promise.all([
    prisma.referralEarning.aggregate({
      where: { referrer: owner, collectedAt: null },
      _sum: { shareMicro: true },
    }),
    prisma.referralEarning.aggregate({
      where: { referrer: owner, collectedAt: { not: null } },
      _sum: { shareMicro: true },
    }),
    prisma.referralEarning.groupBy({
      by: ["campaignId"],
      where: { referrer: owner },
      _sum: { shareMicro: true, feeMicro: true },
    }),
  ]);

  const earningsMap = new Map(
    earningsByCampaign.map((e) => [e.campaignId, e._sum]),
  );

  const referredAddresses = [
    ...new Set(campaigns.flatMap((c) => c.referrals.map((r) => r.referred))),
  ];
  const users = referredAddresses.length
    ? await prisma.user.findMany({
        where: { address: { in: referredAddresses, mode: "insensitive" } },
        select: { address: true, username: true, avatarUrl: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.address.toLowerCase(), u]));

  const referralRows = await Promise.all(
    campaigns.flatMap((c) =>
      c.referrals.map(async (r) => {
        const stats = await referredUserVolume(r.referred);
        const u = userMap.get(r.referred);
        return {
          campaignId: c.id,
          campaignSlug: c.slug,
          referred: r.referred,
          username: u?.username ?? null,
          avatarUrl: u?.avatarUrl ?? null,
          joinedAt: r.createdAt.toISOString(),
          volumeUsd: stats.volumeUsd,
          feesPaidUsd: Number(stats.feesPaidMicro) / 1_000_000,
        };
      }),
    ),
  );

  return {
    sharePercent: REFERRAL_SHARE_BPS / 100,
    maxCampaigns: MAX_CAMPAIGNS_PER_USER,
    pendingUsd: Number(pendingAgg._sum.shareMicro ?? 0n) / 1_000_000,
    collectedUsd: Number(collectedAgg._sum.shareMicro ?? 0n) / 1_000_000,
    campaigns: campaigns.map((c) => ({
      id: c.id,
      slug: c.slug,
      label: c.label,
      link: referralLink(c.slug),
      referralCount: c._count.referrals,
      earnedUsd: Number(earningsMap.get(c.id)?.shareMicro ?? 0n) / 1_000_000,
      feesGeneratedUsd: Number(earningsMap.get(c.id)?.feeMicro ?? 0n) / 1_000_000,
      createdAt: c.createdAt.toISOString(),
    })),
    referrals: referralRows,
  };
}

export async function collectReferralEarnings(
  ownerAddress: string,
): Promise<
  | { ok: true; amountMicro: bigint; collectionId: number }
  | { ok: false; error: string }
> {
  const owner = getAddress(ownerAddress).toLowerCase();

  return prisma.$transaction(async (tx) => {
    const pending = await tx.referralEarning.findMany({
      where: { referrer: owner, collectedAt: null },
      select: { id: true, shareMicro: true },
    });
    if (pending.length === 0) {
      return { ok: false as const, error: "nothing to collect" };
    }

    const amountMicro = pending.reduce((sum, e) => sum + e.shareMicro, 0n);
    if (amountMicro <= 0n) {
      return { ok: false as const, error: "nothing to collect" };
    }

    const collection = await tx.referralCollection.create({
      data: { referrer: owner, amountMicro, status: "Completed" },
    });

    await tx.referralEarning.updateMany({
      where: { id: { in: pending.map((e) => e.id) } },
      data: { collectedAt: new Date(), collectionId: collection.id },
    });

    return {
      ok: true as const,
      amountMicro,
      collectionId: collection.id,
    };
  });
}
