import hre from "hardhat";
import { getAddress } from "viem";

import { ADMIN_ADDRESS } from "../lib/admin";

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

  console.log(`Deploying protocol to ${network}...`);

  // SidebetEscrowV2 (1v1 escrow). Prediction markets are fully off-chain
  // (custodial engine + ledger) and no longer need on-chain contracts.
  const escrowV2 = await hre.viem.deployContract("SidebetEscrowV2", [
    platformFeeRecipient,
  ]);
  console.log(`SidebetEscrowV2 deployed at: ${escrowV2.address}`);
  console.log(`Platform fee recipient: ${platformFeeRecipient}`);

  // Seed the default approved settler at the launch platform fee (0 bps by default).
  const launchFeeBps = Number(process.env.PLATFORM_SIDEBET_FEE_BPS ?? 0);
  if (defaultSettler && /^0x[0-9a-fA-F]{40}$/.test(defaultSettler)) {
    const settler = getAddress(defaultSettler);
    const hash = await escrowV2.write.setSettler([settler, true, launchFeeBps]);
    console.log(`setSettler(${settler}, true, ${launchFeeBps}) tx: ${hash}`);
  } else {
    console.warn("NEXT_PUBLIC_DEFAULT_SETTLER not set; skipping setSettler.");
  }

  console.log("\nAdd these to .env / Vercel:");
  console.log(`NEXT_PUBLIC_ESCROW_V2_ADDRESS_POLYGON=${escrowV2.address}`);

  if (network !== "hardhat" && process.env.POLYGONSCAN_API_KEY) {
    console.log("\nWaiting 30s before verification...");
    await new Promise((r) => setTimeout(r, 30_000));
    await verify(escrowV2.address, [platformFeeRecipient]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
