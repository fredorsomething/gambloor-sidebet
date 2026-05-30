import { getAddress, parseEventLogs, parseAbiItem, parseUnits } from "viem";

import { POLYGON_CHAIN_ID, getTokenBySymbol } from "@/lib/chains";
import { getPublicClient } from "@/lib/onchain";
import { prisma } from "@/lib/db";

export const SUPPORTER_BADGE = "Supporter" as const;
export const SUPPORTER_PRICE_USDC = 7;
export const SUPPORTER_PRICE_WEI = parseUnits(String(SUPPORTER_PRICE_USDC), 6);

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const ACCEPTED_SYMBOLS = ["USDC", "USDC.e"] as const;

export function getTreasuryAddress(): `0x${string}` | null {
  const raw =
    process.env.NEXT_PUBLIC_TREASURY_ADDRESS?.trim() ||
    process.env.NEXT_PUBLIC_FEE_RECIPIENT?.trim();
  if (!raw) return null;
  try {
    return getAddress(raw);
  } catch {
    return null;
  }
}

export function supporterPaymentTokens() {
  return ACCEPTED_SYMBOLS.map((symbol) => {
    const t = getTokenBySymbol(POLYGON_CHAIN_ID, symbol);
    if (!t) return null;
    return { symbol, address: t.address, decimals: t.decimals };
  }).filter(Boolean) as Array<{
    symbol: string;
    address: `0x${string}`;
    decimals: number;
  }>;
}

export function userHasSupporterBadge(badges: string[] | null | undefined): boolean {
  return (badges ?? []).some(
    (b) => b.toLowerCase() === SUPPORTER_BADGE.toLowerCase(),
  );
}

export async function verifySupporterPayment(opts: {
  buyer: `0x${string}`;
  txHash: `0x${string}`;
  tokenSymbol: string;
}): Promise<
  | { ok: true; amount: bigint; token: `0x${string}`; logIndex: number }
  | { ok: false; reason: string }
> {
  const treasury = getTreasuryAddress();
  if (!treasury) {
    return { ok: false, reason: "treasury not configured" };
  }

  const tokenMeta = supporterPaymentTokens().find(
    (t) => t.symbol.toLowerCase() === opts.tokenSymbol.toLowerCase(),
  );
  if (!tokenMeta) {
    return { ok: false, reason: "unsupported payment token" };
  }

  const publicClient = getPublicClient(POLYGON_CHAIN_ID);
  if (!publicClient) {
    return { ok: false, reason: "unsupported chain" };
  }

  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: opts.txHash,
    });
    if (receipt.status !== "success") {
      return { ok: false, reason: "transaction did not succeed" };
    }

    const transfers = parseEventLogs({
      abi: [TRANSFER_EVENT],
      logs: receipt.logs,
      eventName: "Transfer",
    });

    let transferred = 0n;
    let logIndex = -1;
    const token = getAddress(tokenMeta.address);
    const buyer = getAddress(opts.buyer);

    for (const t of transfers) {
      if (getAddress(t.address) !== token) continue;
      if (getAddress(t.args.from) !== buyer) continue;
      if (getAddress(t.args.to) !== treasury) continue;
      transferred += t.args.value;
      if (logIndex < 0) logIndex = t.logIndex;
    }

    if (logIndex < 0 || transferred < SUPPORTER_PRICE_WEI) {
      return { ok: false, reason: "insufficient USDC sent to treasury" };
    }

    const existing = await prisma.badgePurchase.findUnique({
      where: {
        txHash_logIndex: { txHash: opts.txHash, logIndex },
      },
    });
    if (existing) {
      return { ok: false, reason: "payment already redeemed" };
    }

    return {
      ok: true,
      amount: transferred,
      token,
      logIndex,
    };
  } catch (err) {
    console.error("supporter payment verification failed", err);
    return { ok: false, reason: "could not verify payment" };
  }
}

export async function grantSupporterBadge(
  address: string,
  payment: {
    txHash: string;
    logIndex: number;
    amount: bigint;
    token: string;
  },
): Promise<string[]> {
  const addr = getAddress(address);
  const user = await prisma.user.findUnique({ where: { address: addr } });
  const nextBadges = new Set(user?.badges ?? ["User"]);
  nextBadges.add("User");
  nextBadges.add(SUPPORTER_BADGE);

  await prisma.$transaction([
    prisma.badgePurchase.create({
      data: {
        address: addr.toLowerCase(),
        badge: SUPPORTER_BADGE,
        txHash: payment.txHash,
        logIndex: payment.logIndex,
        amount: payment.amount.toString(),
        token: payment.token.toLowerCase(),
      },
    }),
    prisma.user.upsert({
      where: { address: addr },
      create: {
        address: addr,
        badges: [...nextBadges],
      },
      update: {
        badges: [...nextBadges],
      },
    }),
  ]);

  return [...nextBadges];
}
