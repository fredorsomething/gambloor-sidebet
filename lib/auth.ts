import { getAddress } from "viem";

import {
  emailOf,
  embeddedEthereumAddressOf,
  ethereumAddressesOf,
  getPrivyUser,
  resolveProfileWalletAddress,
  verifyPrivyToken,
} from "@/lib/privy";

export type PrivySessionResult =
  | {
      ok: true;
      userId: string;
      email: string | null;
      linkedAddresses: string[];
      profileAddress: string;
    }
  | { ok: false; error: string; status: number };

export type WalletAuthResult =
  | {
      ok: true;
      address: string;
      userId: string;
      email: string | null;
      linkedAddresses: string[];
    }
  | { ok: false; error: string; status: number };

/** Authenticates a Privy session and resolves the canonical profile wallet. */
export async function verifyPrivySession(
  req: Request,
): Promise<PrivySessionResult> {
  const token = await verifyPrivyToken(req);
  if (!token.ok) return token;

  let user;
  try {
    user = await getPrivyUser(token.userId);
  } catch {
    return { ok: false, error: "could not load Privy user", status: 401 };
  }

  const linkedAddresses = ethereumAddressesOf(user);
  const embeddedAddress = embeddedEthereumAddressOf(user);
  const profileAddress = await resolveProfileWalletAddress({
    privyId: token.userId,
    linkedAddresses,
    embeddedAddress,
  });

  if (!profileAddress) {
    return { ok: false, error: "no linked wallet", status: 403 };
  }

  return {
    ok: true,
    userId: token.userId,
    email: emailOf(user),
    linkedAddresses,
    profileAddress,
  };
}

/**
 * Authenticates a write request against Privy.
 *
 * Verifies the bearer token, then resolves the canonical profile wallet
 * (embedded when available). The claimed `address` is accepted when linked,
 * but profile writes are always applied to the canonical wallet so stray
 * browser-extension addresses cannot break saves.
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

  const session = await verifyPrivySession(args.req);
  if (!session.ok) return session;

  const linked = new Set(session.linkedAddresses);
  if (!linked.has(address.toLowerCase()) && linked.size > 0) {
    // Client sent an unlinked/stray address — still allow using canonical profile wallet.
    return {
      ok: true,
      address: session.profileAddress,
      userId: session.userId,
      email: session.email,
      linkedAddresses: session.linkedAddresses,
    };
  }

  return {
    ok: true,
    address: session.profileAddress,
    userId: session.userId,
    email: session.email,
    linkedAddresses: session.linkedAddresses,
  };
}
