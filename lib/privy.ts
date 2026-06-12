import { PrivyClient, type User } from "@privy-io/node";
import { getAddress } from "viem";

import { prisma } from "@/lib/db";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;

let client: PrivyClient | null = null;

/** Lazily-built server-side Privy client (app secret never reaches the browser). */
export function getPrivyClient(): PrivyClient {
  if (!appId || !appSecret) {
    throw new Error(
      "Privy is not configured: set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET.",
    );
  }
  if (!client) {
    client = new PrivyClient({ appId, appSecret });
  }
  return client;
}

export type PrivyTokenResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; status: number };

/** Reads + verifies the `Authorization: Bearer <accessToken>` header. */
export async function verifyPrivyToken(
  req: Request,
): Promise<PrivyTokenResult> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (!token) {
    return { ok: false, error: "missing auth token", status: 401 };
  }

  try {
    const claims = await getPrivyClient().utils().auth().verifyAccessToken(token);
    return { ok: true, userId: claims.user_id };
  } catch {
    return { ok: false, error: "invalid or expired session", status: 401 };
  }
}

/** All EVM wallet addresses (embedded + external) linked to a Privy user. */
export function ethereumAddressesOf(user: User): string[] {
  const out: string[] = [];
  for (const account of user.linked_accounts) {
    if (
      account.type === "wallet" &&
      "chain_type" in account &&
      account.chain_type === "ethereum" &&
      "address" in account &&
      typeof account.address === "string"
    ) {
      out.push(account.address.toLowerCase());
    }
  }
  return out;
}

/** The user's primary email, if they linked one. */
export function emailOf(user: User): string | null {
  for (const account of user.linked_accounts) {
    if (account.type === "email" && "address" in account) {
      return account.address;
    }
  }
  return null;
}

/** Embedded EVM wallet for a Privy user, if they have one. */
export function embeddedEthereumAddressOf(user: User): string | null {
  for (const account of user.linked_accounts) {
    if (account.type !== "wallet") continue;
    if (!("chain_type" in account) || account.chain_type !== "ethereum") continue;
    if (!("address" in account) || typeof account.address !== "string") continue;
    const wallet = account as {
      connector_type?: string;
      wallet_client_type?: string;
    };
    if (
      wallet.connector_type === "embedded" ||
      wallet.wallet_client_type === "privy" ||
      wallet.wallet_client_type === "privy-v2"
    ) {
      return getAddress(account.address);
    }
  }
  return null;
}

function isEmbeddedEthereumAccount(
  account: User["linked_accounts"][number],
): boolean {
  if (account.type !== "wallet") return false;
  if (!("chain_type" in account) || account.chain_type !== "ethereum") return false;
  const wallet = account as {
    connector_type?: string;
    wallet_client_type?: string;
  };
  return (
    wallet.connector_type === "embedded" ||
    wallet.wallet_client_type === "privy" ||
    wallet.wallet_client_type === "privy-v2"
  );
}

/** External EVM wallet (MetaMask, etc.) linked to a Privy user, if any. */
export function externalEthereumAddressOf(user: User): string | null {
  for (const account of user.linked_accounts) {
    if (account.type !== "wallet") continue;
    if (!("chain_type" in account) || account.chain_type !== "ethereum") continue;
    if (!("address" in account) || typeof account.address !== "string") continue;
    if (isEmbeddedEthereumAccount(account)) continue;
    return getAddress(account.address);
  }
  return null;
}

/**
 * Canonical profile wallet for a Privy user: external auth wallet when linked
 * (legacy web3 sign-in), else embedded for email/SMS users, else DB / first linked.
 */
export async function resolveProfileWalletAddress(args: {
  privyId: string;
  linkedAddresses: string[];
  embeddedAddress?: string | null;
  externalAddress?: string | null;
}): Promise<string | null> {
  const linked = args.linkedAddresses.map((a) => getAddress(a));

  if (args.externalAddress) {
    return getAddress(args.externalAddress);
  }

  if (args.embeddedAddress) return getAddress(args.embeddedAddress);

  const byPrivy = await prisma.user.findUnique({ where: { privyId: args.privyId } });
  if (byPrivy) return getAddress(byPrivy.address);

  if (linked.length === 0) return null;

  const rows = await prisma.user.findMany({
    where: { address: { in: linked } },
  });
  const withUsername = rows.find((r) => r.username?.trim());
  if (withUsername) return getAddress(withUsername.address);

  return linked[0] ?? null;
}

/** Fetch the full Privy user record (linked accounts) by user id. */
export async function getPrivyUser(userId: string): Promise<User> {
  return getPrivyClient().users()._get(userId);
}
