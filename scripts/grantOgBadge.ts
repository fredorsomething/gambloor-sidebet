import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const OG_BADGE = "OG";
const prisma = new PrismaClient();

/** One-time backfill: grant the OG badge to every existing user account. */
async function main() {
  const users = await prisma.user.findMany({
    select: { address: true, badges: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const user of users) {
    if (user.badges.includes(OG_BADGE)) {
      skipped++;
      continue;
    }

    await prisma.user.update({
      where: { address: user.address },
      data: { badges: [...user.badges, OG_BADGE] },
    });
    updated++;
  }

  console.log(`Processed ${users.length} user(s): ${updated} updated, ${skipped} already had OG.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
