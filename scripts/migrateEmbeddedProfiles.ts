import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import { PrivyClient, type User as PrivyUser } from "@privy-io/node";
import { getAddress } from "viem";

import { reconcileUserAddress } from "@/lib/userProfile";

const prisma = new PrismaClient();

function emailOf(user: PrivyUser): string | null {
  for (const account of user.linked_accounts) {
    if (account.type === "email" && "address" in account) {
      return account.address;
    }
  }
  return null;
}

function isEmbeddedEthereum(
  account: PrivyUser["linked_accounts"][number],
): boolean {
  if (account.type !== "wallet") return false;
  if (!("chain_type" in account) || account.chain_type !== "ethereum") {
    return false;
  }
  const wallet = account as {
    connector_type?: string;
    wallet_client_type?: string;
  };
  return (
    wallet.connector_type === "embedded" ||
    wallet.wallet_client_type === "privy" ||
    wallet.wallet_client_type === "privy-v2"
  );
}

function linkedEthereumAddresses(user: PrivyUser): string[] {
  const out: string[] = [];
  for (const account of user.linked_accounts) {
    if (
      account.type === "wallet" &&
      "chain_type" in account &&
      account.chain_type === "ethereum" &&
      "address" in account &&
      typeof account.address === "string"
    ) {
      out.push(getAddress(account.address));
    }
  }
  return out;
}

function embeddedEthereumAddress(user: PrivyUser): string | null {
  for (const account of user.linked_accounts) {
    if (isEmbeddedEthereum(account) && "address" in account) {
      return getAddress(account.address);
    }
  }
  return null;
}

async function migrateUsernameHistory(from: string, to: string) {
  const fromAddr = getAddress(from);
  const toAddr = getAddress(to);
  const rows = await prisma.usernameHistory.findMany({
    where: { address: fromAddr },
  });
  for (const row of rows) {
    await prisma.usernameHistory
      .upsert({
        where: {
          username_address: { username: row.username, address: toAddr },
        },
        update: {},
        create: { username: row.username, address: toAddr },
      })
      .catch(() => {});
  }
}

type Stats = {
  scanned: number;
  withEmbedded: number;
  migrated: number;
  skipped: number;
  errors: number;
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(
      "Set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET before running.",
    );
  }

  const client = new PrivyClient({ appId, appSecret });
  const stats: Stats = {
    scanned: 0,
    withEmbedded: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
  };
  const actions: string[] = [];

  for await (const privyUser of client.users().list()) {
    stats.scanned++;
    const embedded = embeddedEthereumAddress(privyUser);
    if (!embedded) continue;
    stats.withEmbedded++;

    const linked = linkedEthereumAddresses(privyUser);
    const email = emailOf(privyUser);
    const dbRow = await prisma.user.findUnique({
      where: { privyId: privyUser.id },
    });
    const dbAddress = dbRow ? getAddress(dbRow.address) : null;
    const staleLinked = linked.filter(
      (a) => a.toLowerCase() !== embedded.toLowerCase(),
    );

    let hasStaleProfile = false;
    for (const addr of staleLinked) {
      const row = await prisma.user.findUnique({ where: { address: addr } });
      if (row?.username || row?.privyId) {
        hasStaleProfile = true;
        break;
      }
    }

    const shouldMigrate =
      hasStaleProfile ||
      (!!dbRow &&
        !!dbAddress &&
        dbAddress.toLowerCase() !== embedded.toLowerCase());

    if (!shouldMigrate) {
      stats.skipped++;
      continue;
    }

    const label = `${privyUser.id} ${dbRow?.username ?? "(no profile)"} ${dbAddress ?? "—"} → ${embedded}`;
    actions.push(label);

    if (dryRun) {
      stats.migrated++;
      continue;
    }

    try {
      const before = dbAddress;
      await reconcileUserAddress({
        privyId: privyUser.id,
        activeAddress: embedded,
        email,
        linkedAddresses: linked,
      });
      if (before && before.toLowerCase() !== embedded.toLowerCase()) {
        await migrateUsernameHistory(before, embedded);
      }
      stats.migrated++;
      console.log(`Migrated ${label}`);
    } catch (err) {
      stats.errors++;
      console.error(`Failed ${label}`, err);
    }
  }

  console.log(
    dryRun ? "Dry run complete." : "Migration complete.",
    stats,
  );
  if (dryRun && actions.length > 0) {
    console.log("Would migrate:");
    for (const line of actions) console.log(`  - ${line}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
