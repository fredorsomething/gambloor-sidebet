import hre from "hardhat";

async function main() {
  const network = hre.network.name;
  console.log(`Deploying SidebetEscrow to ${network}...`);

  const escrow = await hre.viem.deployContract("SidebetEscrow", []);
  console.log(`SidebetEscrow deployed at: ${escrow.address}`);

  if (network !== "hardhat" && process.env.POLYGONSCAN_API_KEY) {
    console.log("Waiting 30s before verification...");
    await new Promise((r) => setTimeout(r, 30_000));
    try {
      await hre.run("verify:verify", {
        address: escrow.address,
        constructorArguments: [],
      });
      console.log("Verified on Polygonscan.");
    } catch (err) {
      console.warn("Verification failed:", err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
