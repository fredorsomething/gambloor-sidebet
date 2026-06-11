/** Minimum time an open offer must stay on the book before it can expire. */
export const MIN_ACCEPT_EXPIRY_SECONDS = 10 * 60;

/** On-chain / API sentinel: offer stays open until manually cancelled. */
export const NO_ACCEPT_DEADLINE = 0;

export const ACCEPT_EXPIRY_PRESETS = [
  { id: "10m", label: "10 min", seconds: 10 * 60 },
  { id: "30m", label: "30 min", seconds: 30 * 60 },
  { id: "1h", label: "1 hour", seconds: 60 * 60 },
  { id: "6h", label: "6 hours", seconds: 6 * 60 * 60 },
  { id: "24h", label: "24 hours", seconds: 24 * 60 * 60 },
  { id: "1w", label: "1 week", seconds: 7 * 24 * 60 * 60 },
  { id: "1m", label: "1 month", seconds: 30 * 24 * 60 * 60 },
] as const;

export type AcceptExpiryPresetId =
  | (typeof ACCEPT_EXPIRY_PRESETS)[number]["id"]
  | "custom";

export type AcceptExpiryUnit = "minutes" | "hours" | "days";

export function resolveAcceptExpirySeconds(
  presetId: AcceptExpiryPresetId,
  custom?: { value: number; unit: AcceptExpiryUnit },
): number | null {
  if (presetId === "custom") {
    if (!custom || !Number.isFinite(custom.value) || custom.value <= 0)
      return null;
    const mult =
      custom.unit === "minutes" ? 60 : custom.unit === "hours" ? 3600 : 86400;
    return Math.floor(custom.value * mult);
  }
  const preset = ACCEPT_EXPIRY_PRESETS.find((p) => p.id === presetId);
  return preset?.seconds ?? null;
}

export function acceptDeadlineUnixFromDuration(
  durationSec: number,
  nowSec = Math.floor(Date.now() / 1000),
): number {
  if (durationSec <= 0) return NO_ACCEPT_DEADLINE;
  return nowSec + durationSec;
}

export function effectiveAcceptDeadlineSec(bet: {
  acceptDeadline: string | bigint | null;
}): number | null {
  if (bet.acceptDeadline == null) return null;
  const n =
    typeof bet.acceptDeadline === "bigint"
      ? Number(bet.acceptDeadline)
      : Number(bet.acceptDeadline);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function isAcceptWindowExpired(
  bet: { acceptDeadline: string | bigint | null },
  status: string,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (status !== "Open") return false;
  const dl = effectiveAcceptDeadlineSec(bet);
  if (dl == null) return false;
  return nowSec > dl;
}

/** Validate a unix accept deadline before create / revise-escrow indexing. */
export function validateAcceptDeadlineUnix(
  deadline: number,
  nowSec = Math.floor(Date.now() / 1000),
): string | null {
  if (deadline === NO_ACCEPT_DEADLINE) return null;
  const min = nowSec + MIN_ACCEPT_EXPIRY_SECONDS;
  if (deadline < min) {
    return "Offer expiry must be at least 10 minutes from now";
  }
  return null;
}
