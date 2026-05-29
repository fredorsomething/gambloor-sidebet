/**
 * On-chain deposit/withdraw bridge for the custodial exchange.
 *
 * Deposits: polls USDC.e Transfer logs into the treasury wallet and credits the
 * sender's collateral balance (idempotent per txHash+logIndex).
 *
 * Withdrawals: processes Pending withdrawal rows by sending USDC.e from the
 * treasury hot wallet and recording the tx. Amounts at/above WITHDRAWAL_AUTO_LIMIT
 * are left in "Review" by the API and skipped here for manual approval.
 *
 * USDC.e on Polygon has 6 decimals, so on-chain units equal our internal
 * micro-units exactly (no scaling needed).
 */
import type { PrismaClient } from "@prisma/client";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

import { Ledger } from "./ledger";

const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as Address;
const CHAIN_ID = 137;
const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const RPC = process.env.NEXT_PUBLIC_POLYGON_RPC || "https://polygon-bor-rpc.publicnode.com";
const TREASURY_KEY = process.env.TREASURY_PRIVATE_KEY?.trim();
const TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_ADDRESS?.trim();
const AUTO_LIMIT = BigInt(process.env.WITHDRAWAL_AUTO_LIMIT || "0");
const MAX_BLOCK_RANGE = 2000n;
const POLL_MS = 15_000;

export class Bridge {
  private ledger: Ledger;
  private publicClient = createPublicClient({ chain: polygon, transport: http(RPC) });
  private lastBlock = 0n;
  private running = false;

  constructor(private prisma: PrismaClient) {
    this.ledger = new Ledger(prisma);
  }

  start() {
    if (!TREASURY_ADDRESS) {
      console.warn("[bridge] NEXT_PUBLIC_TREASURY_ADDRESS not set; bridge disabled");
      return;
    }
    this.running = true;
    void this.loop();
    console.log(`[bridge] started; treasury=${TREASURY_ADDRESS}`);
  }

  stop() {
    this.running = false;
  }

  private async loop() {
    while (this.running) {
      try {
        await this.scanDeposits();
        await this.processWithdrawals();
      } catch (err) {
        console.error("[bridge] loop error", err);
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  private async scanDeposits() {
    if (!TREASURY_ADDRESS) return;
    const treasury = getAddress(TREASURY_ADDRESS);
    const latest = await this.publicClient.getBlockNumber();
    if (this.lastBlock === 0n) {
      // Start a little behind the tip on first run.
      this.lastBlock = latest > 5000n ? latest - 5000n : 0n;
    }
    let from = this.lastBlock + 1n;
    while (from <= latest) {
      const to = from + MAX_BLOCK_RANGE - 1n > latest ? latest : from + MAX_BLOCK_RANGE - 1n;
      const logs = await this.publicClient.getLogs({
        address: USDCE_ADDRESS,
        event: TRANSFER_EVENT,
        args: { to: treasury },
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        const sender = log.args.from as Address | undefined;
        const value = log.args.value as bigint | undefined;
        if (!sender || value == null || value <= 0n) continue;
        const credited = await this.ledger.creditDeposit({
          address: sender.toLowerCase(),
          amount: value,
          txHash: log.transactionHash!,
          logIndex: log.logIndex!,
          chainId: CHAIN_ID,
        });
        if (credited) {
          console.log(`[bridge] deposit ${value} from ${sender} (${log.transactionHash})`);
        }
      }
      this.lastBlock = to;
      from = to + 1n;
    }
  }

  private async processWithdrawals() {
    if (!TREASURY_KEY) return;
    const pending = await this.prisma.withdrawal.findMany({
      where: { status: "Pending" },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    if (pending.length === 0) return;

    const account = privateKeyToAccount(TREASURY_KEY as Hex);
    const wallet = createWalletClient({ account, chain: polygon, transport: http(RPC) });

    for (const w of pending) {
      if (AUTO_LIMIT > 0n && w.amount + w.fee >= AUTO_LIMIT) {
        await this.prisma.withdrawal.update({
          where: { id: w.id },
          data: { status: "Review" },
        });
        continue;
      }
      await this.prisma.withdrawal.update({
        where: { id: w.id },
        data: { status: "Processing" },
      });
      try {
        const hash = await wallet.writeContract({
          address: USDCE_ADDRESS,
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [getAddress(w.address), w.amount],
        });
        await this.publicClient.waitForTransactionReceipt({ hash });
        await this.ledger.completeWithdrawal(w.id, hash);
        console.log(`[bridge] withdrawal #${w.id} sent ${w.amount} to ${w.address} (${hash})`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "send failed";
        console.error(`[bridge] withdrawal #${w.id} failed`, message);
        await this.ledger.failWithdrawal(w.id, message).catch((e) => {
          console.error("[bridge] refund failed", e);
        });
      }
    }
  }
}
