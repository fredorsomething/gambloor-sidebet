import "dotenv/config";
import hre from "hardhat";
import { getAddress } from "viem";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Syncs the off-chain `ApprovedSettler` table onto the SidebetEscrowV2 on-chain
 * registry. The contract enforces settler approval on-chain, while the dropdown
 * reads from the DB — this keeps them aligned. Run as the contract owner
 * (the deployer): `npm run settlers:sync`.
 */
async function main() {
  const escrowAddr = process.env.NEXT_PUBLIC_ESCROW_V2_ADDRESS_POLYGON?.trim();
  if (!escrowAddr) throw new Error("NEXT_PUBLIC_ESCROW_V2_ADDRESS_POLYGON not set");

  const publicClient = await hre.viem.getPublicClient();
  const [owner] = await hre.viem.getWalletClients();
  const escrow = await hre.viem.getContractAt(
    "SidebetEscrowV2",
    getAddress(escrowAddr),
  );

  const onChainOwner = await escrow.read.owner();
  console.log(`Escrow:  ${escrowAddr}`);
  console.log(`Owner:   ${onChainOwner}`);
  console.log(`Signer:  ${owner.account.address}`);
  if (onChainOwner.toLowerCase() !== owner.account.address.toLowerCase()) {
    throw new Error(
      "Signer is not the contract owner; only the owner can approve settlers.",
    );
  }

  const settlers = await prisma.approvedSettler.findMany({
    where: { approved: true },
  });
  console.log(`\nSyncing ${settlers.length} approved settler(s)...`);

  for (const s of settlers) {
    const addr = getAddress(s.address);
    const isApproved = await escrow.read.isApprovedSettler([addr]);
    const feeOnChain = Number(await escrow.read.settlerFeeBps([addr]));
    if (isApproved && feeOnChain === s.feeBps) {
      console.log(`✓ ${addr} already approved at ${s.feeBps} bps`);
      continue;
    }
    const hash = await escrow.write.setSettler([addr, true, s.feeBps]);
    console.log(`→ setSettler(${addr}, true, ${s.feeBps}) tx: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  confirmed`);
  }

  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
