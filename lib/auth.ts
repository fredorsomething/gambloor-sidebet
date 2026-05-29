import { getAddress, recoverMessageAddress, type Hex } from "viem";

/** Normalize line endings / trailing whitespace before comparing signed text. */
export function normalizeProfileMessage(message: string): string {
  return message.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
}

/**
 * Message a user signs to prove wallet ownership when editing their profile.
 * ASCII-only header (no em dash) so wallets do not rewrite punctuation.
 */
export function buildProfileMessage(address: string, issuedAt: string): string {
  return [
    "Sidebet - Update profile",
    "",
    "Sign this message to update your Sidebet profile.",
    "This request will not trigger a transaction or cost any gas.",
    "",
    `Address: ${getAddress(address)}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

/** True if the signed text matches what we expect for these claims. */
function profileMessageMatchesClaims(
  message: string,
  claims: { address: string; issuedAt: string },
): boolean {
  const signed = normalizeProfileMessage(message);
  const expected = normalizeProfileMessage(
    buildProfileMessage(claims.address, claims.issuedAt),
  );
  if (signed === expected) return true;

  // Older clients used an em dash in the title.
  const legacy = normalizeProfileMessage(
    expected.replace("Sidebet - Update profile", "Sidebet \u2014 Update profile"),
  );
  if (signed === legacy) return true;

  // Wallets must not change Address / Issued At lines; allow minor header drift.
  const addr = claims.address.toLowerCase();
  return (
    signed.includes("Update profile") &&
    signed.includes("Sign this message to update your Sidebet profile.") &&
    signed.toLowerCase().includes(`address: ${addr}`) &&
    signed.includes(`Issued At: ${claims.issuedAt}`)
  );
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
  if (!profileMessageMatchesClaims(args.message, claims)) {
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
