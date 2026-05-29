import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { getAddress } from "viem";

import { ADMIN_ADDRESS, ADMIN_USERNAME } from "../lib/admin";

const prisma = new PrismaClient();

async function main() {
  const raw = process.env.NEXT_PUBLIC_DEFAULT_SETTLER?.trim() ?? ADMIN_ADDRESS;
  const address = getAddress(raw);

  await prisma.approvedSettler.upsert({
    where: { address },
    update: { approved: true },
    create: { address, feeBps: 200, approved: true },
  });
  console.log(`Seeded approved settler ${address} at 200 bps (2%).`);

  await prisma.user.upsert({
    where: { address },
    update: { username: ADMIN_USERNAME },
    create: { address, username: ADMIN_USERNAME },
  });
  console.log(`Seeded admin user @${ADMIN_USERNAME} at ${address}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
