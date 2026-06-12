import "dotenv/config";
import hre from "hardhat";
import { getAddress, parseUnits } from "viem";
import { PrismaClient } from "@prisma/client";

/** Default platform settler / admin wallet (matches lib/admin.ts). */
const ADMIN_ADDRESS = getAddress(
  "0x445525f628D4840e2F14148f2547e6F270Caa3eb",
);

/** Bridged USDC.e on Polygon — the only collateral for new sidebets + markets. */
const USDCE_ADDRESS = getAddress(
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
);

/** Flat market creation fee: 1 USDC.e. */
const MARKET_CREATION_FEE = parseUnits("1", 6);

const prisma = new PrismaClient();

async function verify(address: string, constructorArguments: unknown[]) {
  try {
    await hre.run("verify:verify", { address, constructorArguments });
    console.log(`Verified ${address}`);
  } catch (err) {
    console.warn(`Verification failed for ${address}:`, err);
  }
}

async function main() {
  const network = hre.network.name;
  const defaultSettler = process.env.NEXT_PUBLIC_DEFAULT_SETTLER?.trim();
  const platformFeeRecipient = getAddress(defaultSettler ?? ADMIN_ADDRESS);
  const publicClient = await hre.viem.getPublicClient();

  console.log(`Deploying SidebetEscrowV3 to ${network}...`);

  const escrowV3 = await hre.viem.deployContract("SidebetEscrowV3", [
    platformFeeRecipient,
  ]);
  console.log(`SidebetEscrowV3 deployed at: ${escrowV3.address}`);
  console.log(`Platform fee recipient: ${platformFeeRecipient}`);

  // Seed every approved settler from the off-chain registry so existing
  // settlers keep working on the new contract.
  const settlers = await prisma.approvedSettler.findMany({
    where: { approved: true },
  });
  const launchFeeBps = Number(process.env.PLATFORM_SIDEBET_FEE_BPS ?? 0);
  const seeded = new Set<string>();
  for (const s of settlers) {
    const addr = getAddress(s.address);
    const hash = await escrowV3.write.setSettler([addr, true, s.feeBps]);
    await publicClient.waitForTransactionReceipt({ hash });
    seeded.add(addr.toLowerCase());
    console.log(`setSettler(${addr}, true, ${s.feeBps}) tx: ${hash}`);
  }
  if (defaultSettler && !seeded.has(defaultSettler.toLowerCase())) {
    const addr = getAddress(defaultSettler);
    const hash = await escrowV3.write.setSettler([addr, true, launchFeeBps]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`setSettler(${addr}, true, ${launchFeeBps}) tx: ${hash}`);
  }

  // 1 USDC.e flat fee to register a market. Sidebet creation fee stays at 0 on
  // chain (the $0.05 anti-spam transfer continues off-contract for now).
  const feeHash = await escrowV3.write.setMarketCreationFee([
    USDCE_ADDRESS,
    MARKET_CREATION_FEE,
  ]);
  await publicClient.waitForTransactionReceipt({ hash: feeHash });
  console.log(`setMarketCreationFee(USDC.e, ${MARKET_CREATION_FEE}) tx: ${feeHash}`);

  console.log("\nAdd these to .env / Vercel:");
  console.log(`NEXT_PUBLIC_ESCROW_V3_ADDRESS_POLYGON=${escrowV3.address}`);

  if (network !== "hardhat" && process.env.POLYGONSCAN_API_KEY) {
    console.log("\nWaiting 30s before verification...");
    await new Promise((r) => setTimeout(r, 30_000));
    await verify(escrowV3.address, [platformFeeRecipient]);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
