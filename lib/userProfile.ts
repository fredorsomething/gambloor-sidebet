import { getAddress } from "viem";
import type { User } from "@prisma/client";

import { prisma } from "@/lib/db";
import { publicUserSelect } from "@/lib/publicProfile";
import { migrateWalletAddress } from "@/lib/walletMigration";

type ProfileFields = {
  username?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  twitter?: string | null;
  discord?: string | null;
};

function pickProfileFields(rows: User[]): ProfileFields & { verified?: boolean; badges?: string[] } {
  const withUsername = rows.find((r) => r.username?.trim());
  const source = withUsername ?? rows.find((r) => r.privyId) ?? rows[0];
  if (!source) return {};
  return {
    username: source.username,
    avatarUrl: source.avatarUrl,
    bio: source.bio,
    twitter: source.twitter,
    discord: source.discord,
    verified: source.verified,
    badges: source.badges,
  };
}

/**
 * Privy users can end up with profiles on an old external wallet while the app
 * now uses their embedded wallet. Move the profile row to the active address.
 */
export async function reconcileUserAddress(args: {
  privyId: string;
  activeAddress: string;
  email: string | null;
  linkedAddresses?: string[];
}): Promise<User | null> {
  const active = getAddress(args.activeAddress);
  const linked = [
    ...new Set(
      (args.linkedAddresses?.length ? args.linkedAddresses : [active]).map((a) =>
        getAddress(a).toLowerCase(),
      ),
    ),
  ];

  const linkedRows = linked.length
    ? await prisma.user.findMany({
        where: { address: { in: linked.map((a) => getAddress(a)) } },
      })
    : [];
  const byPrivy = await prisma.user.findUnique({ where: { privyId: args.privyId } });

  const staleAddresses = new Set<string>();
  for (const addr of linked) {
    if (addr.toLowerCase() !== active.toLowerCase()) {
      staleAddresses.add(getAddress(addr));
    }
  }
  if (
    byPrivy &&
    byPrivy.address.toLowerCase() !== active.toLowerCase()
  ) {
    staleAddresses.add(byPrivy.address);
  }

  const activeRow = linkedRows.find(
    (r) => r.address.toLowerCase() === active.toLowerCase(),
  );
  const mergeSources = [
    ...(byPrivy ? [byPrivy] : []),
    ...linkedRows.filter((r) => r.address.toLowerCase() !== active.toLowerCase()),
  ];

  if (mergeSources.length === 0 && !activeRow) return null;

  const profile = {
    privyId: args.privyId,
    email: args.email,
    ...pickProfileFields([...(activeRow ? [activeRow] : []), ...mergeSources]),
  };

  const needsWrite =
    staleAddresses.size > 0 ||
    !activeRow ||
    activeRow.privyId !== args.privyId ||
    (profile.username && activeRow.username !== profile.username);

  if (!needsWrite) return activeRow ?? byPrivy;

  for (const stale of staleAddresses) {
    await migrateWalletAddress(stale, active);
  }

  await prisma.$transaction(async (tx) => {
    for (const stale of staleAddresses) {
      await tx.user.updateMany({
        where: { address: stale },
        data: { privyId: null, username: null },
      });
    }

    await tx.user.upsert({
      where: { address: active },
      create: { address: active, ...profile },
      update: profile,
    });
  });

  return prisma.user.findUnique({ where: { address: active } });
}

export async function getAuthenticatedProfile(args: {
  privyId: string;
  activeAddress: string;
  email: string | null;
  linkedAddresses?: string[];
}) {
  await reconcileUserAddress(args);
  const address = getAddress(args.activeAddress);
  return prisma.user.findUnique({
    where: { address },
    select: publicUserSelect,
  });
}

export async function upsertUserProfile(args: {
  address: string;
  privyId: string;
  email: string | null;
  linkedAddresses?: string[];
  data: ProfileFields;
}): Promise<User> {
  const address = getAddress(args.address);
  const linked = new Set(
    (args.linkedAddresses ?? [address]).map((a) => getAddress(a).toLowerCase()),
  );

  await reconcileUserAddress({
    privyId: args.privyId,
    activeAddress: address,
    email: args.email,
    linkedAddresses: [...linked],
  });

  if (args.data.username) {
    const existing = await prisma.user.findFirst({
      where: { username: { equals: args.data.username, mode: "insensitive" } },
    });
    if (existing && existing.address.toLowerCase() !== address.toLowerCase()) {
      const sameOwner =
        existing.privyId === args.privyId ||
        linked.has(existing.address.toLowerCase());
      if (sameOwner) {
        await prisma.user.update({
          where: { address: existing.address },
          data: { username: null, privyId: null },
        });
      } else {
        throw new ProfileConflictError("username already taken");
      }
    }
  }

  const prior = await prisma.user.findUnique({ where: { address } });
  const oldUsername = prior?.username?.trim();
  const newUsername = args.data.username?.trim() || null;
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

  return prisma.user.upsert({
    where: { address },
    update: {
      privyId: args.privyId,
      email: args.email,
      username: args.data.username ?? null,
      avatarUrl: args.data.avatarUrl ?? null,
      bio: args.data.bio ?? null,
      twitter: args.data.twitter ?? null,
      discord: args.data.discord ?? null,
    },
    create: {
      address,
      privyId: args.privyId,
      email: args.email,
      username: args.data.username ?? null,
      avatarUrl: args.data.avatarUrl ?? null,
      bio: args.data.bio ?? null,
      twitter: args.data.twitter ?? null,
      discord: args.data.discord ?? null,
    },
  });
}

export class ProfileConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileConflictError";
  }
}
