import { getAddress, recoverMessageAddress, type Hex } from "viem";

/**
 * Message a user signs to prove wallet ownership when editing their profile.
 * Kept identical between client (signing) and server (verification).
 */
export function buildProfileMessage(address: string, issuedAt: string): string {
  return [
    "Sidebet — Update profile",
    "",
    "Sign this message to update your Sidebet profile.",
    "This request will not trigger a transaction or cost any gas.",
    "",
    `Address: ${getAddress(address)}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export function parseProfileMessage(
  message: string,
): { address: string; issuedAt: string } | null {
  const addrMatch = message.match(/^Address:\s*(0x[0-9a-fA-F]{40})$/m);
  const issuedMatch = message.match(/^Issued At:\s*(.+)$/m);
  if (!addrMatch || !issuedMatch) return null;
  try {
    return {
      address: getAddress(addrMatch[1]),
      issuedAt: issuedMatch[1].trim(),
    };
  } catch {
    return null;
  }
}

export const PROFILE_MESSAGE_TTL_MS = 15 * 60 * 1000;

export type ProfileAuthResult =
  | { ok: true; address: string }
  | { ok: false; error: string; status: number };

/** Verifies a profile-update signature (shared by PUT profile + avatar upload). */
export async function verifyProfileAuth(args: {
  address: string;
  message: string;
  signature: string;
}): Promise<ProfileAuthResult> {
  const claims = parseProfileMessage(args.message);
  if (!claims) return { ok: false, error: "malformed message", status: 400 };

  let address: string;
  try {
    address = getAddress(args.address);
  } catch {
    return { ok: false, error: "bad address", status: 400 };
  }

  if (claims.address.toLowerCase() !== address.toLowerCase()) {
    return { ok: false, error: "message address mismatch", status: 401 };
  }
  if (buildProfileMessage(address, claims.issuedAt) !== args.message) {
    return { ok: false, error: "message does not match canonical format", status: 400 };
  }

  const issuedMs = Date.parse(claims.issuedAt);
  if (
    !Number.isFinite(issuedMs) ||
    Math.abs(Date.now() - issuedMs) > PROFILE_MESSAGE_TTL_MS
  ) {
    return { ok: false, error: "signature expired, please retry", status: 401 };
  }

  try {
    const recovered = await recoverMessageAddress({
      message: args.message,
      signature: args.signature as Hex,
    });
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return { ok: false, error: "signature does not match address", status: 401 };
    }
  } catch {
    return { ok: false, error: "invalid signature", status: 401 };
  }

  return { ok: true, address };
}
