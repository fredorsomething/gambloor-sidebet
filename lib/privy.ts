import { PrivyClient, type User } from "@privy-io/node";

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

/** Fetch the full Privy user record (linked accounts) by user id. */
export async function getPrivyUser(userId: string): Promise<User> {
  return getPrivyClient().users()._get(userId);
}
