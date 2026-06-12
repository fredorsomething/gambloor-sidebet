import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import hre from "hardhat";
import { getAddress, isAddress, type Hex } from "viem";

/** Default platform settler / admin wallet (matches lib/admin.ts). */
const ADMIN_ADDRESS = getAddress(
  "0x445525f628D4840e2F14148f2547e6F270Caa3eb",
);

const ROOT = process.cwd();
const HARDHAT_CONFIG = path.join(ROOT, "hardhat.config.ts");

const V2_LEGACY_SOURCE = path.join(ROOT, "scripts/legacy/SidebetEscrowV2.sol");
const V1_LEGACY_SOURCE = path.join(ROOT, "scripts/legacy/SidebetEscrow.sol");

async function verifyContract(
  label: string,
  address: string,
  constructorArguments: unknown[] = [],
) {
  const args = constructorArguments
    .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
    .join(" ");
  const cmd = `npx hardhat verify --network polygon ${address}${args ? ` ${args}` : ""}`;
  try {
    execSync(cmd, { cwd: ROOT, stdio: "inherit" });
    console.log(`Verified ${label} at ${address}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already verified/i.test(msg)) {
      console.log(`${label} at ${address} is already verified`);
      return;
    }
    throw new Error(`Verification failed for ${label} (${address}): ${msg}`);
  }
}

function resolveV2PlatformFeeRecipient(): `0x${string}` {
  const raw =
    process.env.VERIFY_V2_PLATFORM_FEE_RECIPIENT?.trim() ||
    process.env.NEXT_PUBLIC_DEFAULT_SETTLER?.trim() ||
    ADMIN_ADDRESS;
  if (!isAddress(raw)) {
    throw new Error(
      "Invalid platform fee recipient — set VERIFY_V2_PLATFORM_FEE_RECIPIENT or NEXT_PUBLIC_DEFAULT_SETTLER",
    );
  }
  return getAddress(raw);
}

async function fetchOnChainBytecode(address: `0x${string}`): Promise<Hex> {
  const client = await hre.viem.getPublicClient();
  const code = await client.getBytecode({ address });
  if (!code || code === "0x") {
    throw new Error(`No bytecode at ${address}`);
  }
  return code;
}

function readArtifactBytecode(contractFile: string, contractName: string): Hex {
  const artifactPath = path.join(
    ROOT,
    `artifacts/contracts/${contractFile}/${contractName}.json`,
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as {
    deployedBytecode: Hex;
  };
  return artifact.deployedBytecode;
}

function recompile(force = true) {
  if (force) {
    fs.rmSync(path.join(ROOT, "cache"), { recursive: true, force: true });
    fs.rmSync(path.join(ROOT, "artifacts"), { recursive: true, force: true });
  }
  execSync(`npx hardhat compile${force ? " --force" : ""}`, {
    cwd: ROOT,
    stdio: "inherit",
  });
}

function swapSourceFile(sourcePath: string, targetPath: string): string {
  const backupDir = path.join(ROOT, ".verify-backup");
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, path.basename(targetPath));
  fs.copyFileSync(targetPath, backup);
  fs.copyFileSync(sourcePath, targetPath);
  return backup;
}

function restoreSourceFile(targetPath: string, backup: string) {
  fs.copyFileSync(backup, targetPath);
  fs.unlinkSync(backup);
}

function beginLegacyIsolation(keepContractFile: string): () => void {
  const contractsDir = path.join(ROOT, "contracts");
  const stashDir = path.join(ROOT, ".verify-stash");
  fs.mkdirSync(stashDir, { recursive: true });

  const keepPath = path.join(contractsDir, keepContractFile);
  const hidden: string[] = [];

  for (const entry of fs.readdirSync(contractsDir)) {
    const full = path.join(contractsDir, entry);
    if (full === keepPath) {
      continue;
    }
    const dest = path.join(stashDir, entry);
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    fs.renameSync(full, dest);
    hidden.push(entry);
  }

  return () => {
    for (const entry of hidden) {
      const from = path.join(stashDir, entry);
      const to = path.join(contractsDir, entry);
      if (fs.existsSync(to)) {
        fs.rmSync(to, { recursive: true, force: true });
      }
      fs.renameSync(from, to);
    }
    fs.rmSync(stashDir, { recursive: true, force: true });
  };
}

async function verifyWithSnapshot(args: {
  label: string;
  address: `0x${string}`;
  contractFile: string;
  contractName: string;
  legacySourcePath: string;
  legacyViaIr: boolean;
  currentConstructorArgs: unknown[];
  legacyConstructorArgs: unknown[];
  legacyNote: string;
}) {
  const chainBytecode = await fetchOnChainBytecode(args.address);
  const currentBytecode = readArtifactBytecode(
    args.contractFile,
    args.contractName,
  );

  if (currentBytecode.toLowerCase() === chainBytecode.toLowerCase()) {
    if (args.currentConstructorArgs.length > 0) {
      console.log(
        `${args.label} (current source) constructor args:`,
        args.currentConstructorArgs,
      );
    }
    await verifyContract(args.label, args.address, args.currentConstructorArgs);
    return;
  }

  if (!fs.existsSync(args.legacySourcePath)) {
    throw new Error(
      `Current ${args.label} source does not match chain and legacy snapshot is missing at ${args.legacySourcePath}`,
    );
  }

  console.warn(
    `Current ${args.label} bytecode does not match chain — verifying with deployed snapshot (${args.legacySourcePath})...`,
  );

  const targetPath = path.join(ROOT, "contracts", args.contractFile);
  const backup = swapSourceFile(args.legacySourcePath, targetPath);
  const endIsolation = beginLegacyIsolation(args.contractFile);
  const originalConfig = fs.readFileSync(HARDHAT_CONFIG, "utf8");
  const patchedConfig = originalConfig.replace(
    /viaIR:\s*(true|false)/,
    `viaIR: ${args.legacyViaIr}`,
  );
  try {
    if (patchedConfig !== originalConfig) {
      fs.writeFileSync(HARDHAT_CONFIG, patchedConfig);
    }
    recompile();
    const legacyBytecode = readArtifactBytecode(
      args.contractFile,
      args.contractName,
    );
    if (legacyBytecode.toLowerCase() !== chainBytecode.toLowerCase()) {
      throw new Error(
        `Neither current nor legacy ${args.label} source matches on-chain bytecode.`,
      );
    }
    console.log(`Matched deployed snapshot. ${args.legacyNote}`);
    await verifyContract(
      `${args.label} (deployed snapshot)`,
      args.address,
      args.legacyConstructorArgs,
    );
  } finally {
    fs.writeFileSync(HARDHAT_CONFIG, originalConfig);
    endIsolation();
    restoreSourceFile(targetPath, backup);
    recompile();
  }
}

async function verifyV3(address: `0x${string}`) {
  console.log(
    `SidebetEscrowV3 constructor args:`,
    [resolveV2PlatformFeeRecipient()],
  );
  await verifyContract("SidebetEscrowV3", address, [
    resolveV2PlatformFeeRecipient(),
  ]);
}

async function verifyV2(address: `0x${string}`) {
  await verifyWithSnapshot({
    label: "SidebetEscrowV2",
    address,
    contractFile: "SidebetEscrowV2.sol",
    contractName: "SidebetEscrowV2",
    legacySourcePath: V2_LEGACY_SOURCE,
    legacyViaIr: true,
    currentConstructorArgs: [resolveV2PlatformFeeRecipient()],
    legacyConstructorArgs: [],
    legacyNote:
      "No constructor args — pre-platform-fee deployment (settler received fees).",
  });
}

async function verifyV1(address: `0x${string}`) {
  await verifyWithSnapshot({
    label: "SidebetEscrow",
    address,
    contractFile: "SidebetEscrow.sol",
    contractName: "SidebetEscrow",
    legacySourcePath: V1_LEGACY_SOURCE,
    legacyViaIr: false,
    currentConstructorArgs: [],
    legacyConstructorArgs: [],
    legacyNote: "Compiled with viaIR: false (original mainnet deployment).",
  });
}

async function main() {
  const network = hre.network.name;
  if (network === "hardhat") {
    throw new Error("Run with --network polygon (not hardhat)");
  }
  if (!process.env.POLYGONSCAN_API_KEY?.trim()) {
    throw new Error(
      "POLYGONSCAN_API_KEY is not set — get one at https://polygonscan.com/myapikey",
    );
  }

  const v3Address = process.env.NEXT_PUBLIC_ESCROW_V3_ADDRESS_POLYGON?.trim();
  const v2Address = process.env.NEXT_PUBLIC_ESCROW_V2_ADDRESS_POLYGON?.trim();
  const v1Address = process.env.NEXT_PUBLIC_ESCROW_ADDRESS_POLYGON?.trim();

  if (!v3Address && !v2Address && !v1Address) {
    throw new Error(
      "Set NEXT_PUBLIC_ESCROW_V3_ADDRESS_POLYGON, NEXT_PUBLIC_ESCROW_V2_ADDRESS_POLYGON and/or NEXT_PUBLIC_ESCROW_ADDRESS_POLYGON",
    );
  }

  console.log(`Verifying contracts on ${network}...`);

  if (v3Address && process.env.VERIFY_SKIP_V3 !== "1") {
    if (!isAddress(v3Address)) {
      throw new Error(`Invalid NEXT_PUBLIC_ESCROW_V3_ADDRESS_POLYGON: ${v3Address}`);
    }
    await verifyV3(getAddress(v3Address));
  }

  if (v2Address && process.env.VERIFY_SKIP_V2 !== "1") {
    if (!isAddress(v2Address)) {
      throw new Error(`Invalid NEXT_PUBLIC_ESCROW_V2_ADDRESS_POLYGON: ${v2Address}`);
    }
    await verifyV2(getAddress(v2Address));
  }

  if (v1Address) {
    if (!isAddress(v1Address)) {
      throw new Error(`Invalid NEXT_PUBLIC_ESCROW_ADDRESS_POLYGON: ${v1Address}`);
    }
    await verifyV1(getAddress(v1Address));
  }

  console.log("\nDone. Check Polygonscan for the green verified checkmark.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
