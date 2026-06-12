import { getAddress } from "viem";

import {
  emailOf,
  ethereumAddressesOf,
  getPrivyUser,
  verifyPrivyToken,
} from "@/lib/privy";

export type WalletAuthResult =
  | {
      ok: true;
      address: string;
      userId: string;
      email: string | null;
      linkedAddresses: string[];
    }
  | { ok: false; error: string; status: number };

/**
 * Authenticates a write request against Privy.
 *
 * Verifies the `Authorization: Bearer` access token, then confirms the claimed
 * wallet `address` is one of the EVM wallets (embedded or external) linked to
 * the authenticated Privy user. This replaces the old EIP-191 signature flow.
 */
export async function verifyWalletAuth(args: {
  req: Request;
  address: string;
}): Promise<WalletAuthResult> {
  let address: string;
  try {
    address = getAddress(args.address);
  } catch {
    return { ok: false, error: "bad address", status: 400 };
  }

  const token = await verifyPrivyToken(args.req);
  if (!token.ok) return token;

  let user;
  try {
    user = await getPrivyUser(token.userId);
  } catch {
    return { ok: false, error: "could not load Privy user", status: 401 };
  }

  const owned = ethereumAddressesOf(user);
  if (!owned.includes(address.toLowerCase())) {
    return {
      ok: false,
      error: "this wallet is not linked to your account",
      status: 403,
    };
  }

  return {
    ok: true,
    address,
    userId: token.userId,
    email: emailOf(user),
    linkedAddresses: owned,
  };
}
