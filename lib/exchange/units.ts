/**
 * Integer money math for the custodial exchange.
 *
 * Everything is expressed in micro-units (10^6) of the collateral (USDC.e has 6
 * decimals). A whole share redeems for exactly 1 collateral unit, so:
 *   - 1 micro-share  <->  1 micro-USDC at redemption.
 *   - price is micro-USDC per WHOLE share, in the open interval (0, SCALE).
 *   - quantity is micro-shares.
 *
 * No floating point is ever used on money. `cost = price * qty / SCALE` with
 * floor division; the matching engine pairs counterparties so that rounding
 * never breaks conservation (see effects.ts).
 */

export const SCALE = 1_000_000n; // 10^6: one whole share / one whole USDC.
export const MIN_PRICE = 1n;
export const MAX_PRICE = SCALE - 1n; // 0.999999

export type Side = "BUY" | "SELL";
export type OrderType = "LIMIT" | "MARKET";
export type MatchType = "NORMAL" | "MINT" | "MERGE";

/** Collateral cost (micro-USDC) of `qty` micro-shares at `price`. Floor. */
export function costOf(price: bigint, qty: bigint): bigint {
  return (price * qty) / SCALE;
}

/** Fee (micro-USDC) on a notional amount given basis points. Floor. */
export function feeOf(notional: bigint, feeBps: number): bigint {
  if (feeBps <= 0) return 0n;
  return (notional * BigInt(Math.round(feeBps))) / 10_000n;
}

export function maxBigint(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function minBigint(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/** Clamp a price into the tradable range. */
export function isValidPrice(price: bigint): boolean {
  return price >= MIN_PRICE && price <= MAX_PRICE;
}

/** Parse a decimal price string in [0,1] (e.g. "0.62") to micro price. */
export function parsePrice(input: string | number): bigint {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) throw new Error("bad price");
  const micro = BigInt(Math.round(n * 1_000_000));
  return micro;
}

/** Parse a decimal share/collateral amount (whole units) to micro-units. */
export function parseAmount(input: string | number): bigint {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n) || n < 0) throw new Error("bad amount");
  return BigInt(Math.round(n * 1_000_000));
}

/** Format micro-units to a decimal string with up to 6 dp (trailing trimmed). */
export function formatMicro(micro: bigint): string {
  const neg = micro < 0n;
  const v = neg ? -micro : micro;
  const whole = v / SCALE;
  const frac = v % SCALE;
  let s = whole.toString();
  if (frac > 0n) {
    const f = frac.toString().padStart(6, "0").replace(/0+$/, "");
    s += "." + f;
  }
  return neg ? "-" + s : s;
}

/** Format a micro price as a probability in [0,1] (string, up to 6 dp). */
export function formatPrice(micro: bigint): string {
  return formatMicro(micro);
}
