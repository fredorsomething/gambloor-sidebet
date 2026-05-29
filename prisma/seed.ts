import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { getAddress } from "viem";

const prisma = new PrismaClient();

async function main() {
  const raw = process.env.NEXT_PUBLIC_DEFAULT_SETTLER?.trim();
  if (!raw) {
    console.warn("NEXT_PUBLIC_DEFAULT_SETTLER not set; skipping settler seed.");
    return;
  }

  const address = getAddress(raw);
  await prisma.approvedSettler.upsert({
    where: { address },
    update: { approved: true },
    create: { address, feeBps: 200, approved: true },
  });
  console.log(`Seeded approved settler ${address} at 200 bps (2%).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
