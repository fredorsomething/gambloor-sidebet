import hre from "hardhat";
import { getAddress } from "viem";

// Reuse the already-deployed ConditionalTokens (collateral-agnostic per condition).
const EXISTING_CTF = "0xd74abfaf34866d0d05d9fc415ee2608e9276933b";
// Bridged USDC.e on Polygon — the collateral we want CLOB markets to settle in.
const USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

async function main() {
  const ctf = getAddress(EXISTING_CTF);
  const collateral = getAddress(USDC_E);

  console.log(`Deploying CTFExchange bound to USDC.e on ${hre.network.name}...`);
  console.log(`  CTF:        ${ctf}`);
  console.log(`  Collateral: ${collateral} (USDC.e)`);

  const exchange = await hre.viem.deployContract("CTFExchange", [ctf, collateral]);
  console.log(`\nCTFExchange (USDC.e) deployed at: ${exchange.address}`);

  console.log("\nUpdate .env / Vercel with:");
  console.log(`NEXT_PUBLIC_EXCHANGE_ADDRESS_POLYGON=${exchange.address}`);
  console.log(`NEXT_PUBLIC_COLLATERAL_ADDRESS_POLYGON=${collateral}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
