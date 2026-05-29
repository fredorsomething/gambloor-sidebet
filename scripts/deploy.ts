import hre from "hardhat";
import { getAddress } from "viem";

// Native USDC on Polygon mainnet (6 decimals) — collateral for CLOB markets.
const POLYGON_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

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
  const collateral =
    process.env.NEXT_PUBLIC_COLLATERAL_ADDRESS_POLYGON?.trim() || POLYGON_USDC;

  console.log(`Deploying protocol to ${network}...`);

  // 1) SidebetEscrowV2 (1v1 escrow).
  const escrowV2 = await hre.viem.deployContract("SidebetEscrowV2", []);
  console.log(`SidebetEscrowV2 deployed at: ${escrowV2.address}`);

  // 2) ConditionalTokens (ERC-1155 outcome shares).
  const ctf = await hre.viem.deployContract("ConditionalTokens", []);
  console.log(`ConditionalTokens deployed at: ${ctf.address}`);

  // 3) CTFExchange (EIP-712 order settlement) bound to the CTF + collateral.
  const exchange = await hre.viem.deployContract("CTFExchange", [
    ctf.address,
    getAddress(collateral),
  ]);
  console.log(`CTFExchange deployed at: ${exchange.address}`);

  // Seed the default approved settler at 2% (200 bps) on the escrow registry.
  if (defaultSettler && /^0x[0-9a-fA-F]{40}$/.test(defaultSettler)) {
    const settler = getAddress(defaultSettler);
    const hash = await escrowV2.write.setSettler([settler, true, 200]);
    console.log(`setSettler(${settler}, true, 200) tx: ${hash}`);
  } else {
    console.warn("NEXT_PUBLIC_DEFAULT_SETTLER not set; skipping setSettler.");
  }

  console.log("\nAdd these to .env / Vercel:");
  console.log(`NEXT_PUBLIC_ESCROW_V2_ADDRESS_POLYGON=${escrowV2.address}`);
  console.log(`NEXT_PUBLIC_CTF_ADDRESS_POLYGON=${ctf.address}`);
  console.log(`NEXT_PUBLIC_EXCHANGE_ADDRESS_POLYGON=${exchange.address}`);

  if (network !== "hardhat" && process.env.POLYGONSCAN_API_KEY) {
    console.log("\nWaiting 30s before verification...");
    await new Promise((r) => setTimeout(r, 30_000));
    await verify(escrowV2.address, []);
    await verify(ctf.address, []);
    await verify(exchange.address, [ctf.address, getAddress(collateral)]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
