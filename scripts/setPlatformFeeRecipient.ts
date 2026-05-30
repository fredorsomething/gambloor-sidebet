import "dotenv/config";
import hre from "hardhat";
import { getAddress } from "viem";

import { ADMIN_ADDRESS } from "../lib/admin";

/**
 * Point an existing SidebetEscrowV2 at the admin wallet for platform fees.
 * Run as contract owner: `npm run escrow:set-fee-recipient`
 */
async function main() {
  const escrowAddr = process.env.NEXT_PUBLIC_ESCROW_V2_ADDRESS_POLYGON?.trim();
  if (!escrowAddr) throw new Error("NEXT_PUBLIC_ESCROW_V2_ADDRESS_POLYGON not set");

  const recipient = getAddress(
    process.env.NEXT_PUBLIC_DEFAULT_SETTLER?.trim() ?? ADMIN_ADDRESS,
  );

  const [owner] = await hre.viem.getWalletClients();
  const escrow = await hre.viem.getContractAt(
    "SidebetEscrowV2",
    getAddress(escrowAddr),
  );

  const onChainOwner = (await escrow.read.owner()) as `0x${string}`;
  if (onChainOwner.toLowerCase() !== owner.account.address.toLowerCase()) {
    throw new Error("Signer is not the contract owner");
  }

  const current = (await escrow.read.platformFeeRecipient()) as `0x${string}`;
  if (current.toLowerCase() === recipient.toLowerCase()) {
    console.log(`✓ platformFeeRecipient already ${recipient}`);
    return;
  }

  const hash = await escrow.write.setPlatformFeeRecipient([recipient]);
  console.log(`→ setPlatformFeeRecipient(${recipient}) tx: ${hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
