/**
 * Deterministic ledger account keys. A nullable composite unique can't be used
 * in Postgres (NULLs compare distinct), so every Account row carries a single
 * canonical `key` string instead.
 */

export type AccountKind = "COLLATERAL" | "SHARE" | "RESERVE" | "FEE";

export const HOUSE = "house";

export function collateralKey(owner: string): string {
  return `COLLATERAL|${owner.toLowerCase()}||`;
}

export function shareKey(
  owner: string,
  marketId: number,
  outcomeIndex: number,
): string {
  return `SHARE|${owner.toLowerCase()}|${marketId}|${outcomeIndex}`;
}

export function reserveKey(marketId: number): string {
  return `RESERVE|market:${marketId}|${marketId}|`;
}

export function feeKey(): string {
  return `FEE|${HOUSE}||`;
}

export type ParsedKey = {
  kind: AccountKind;
  owner: string;
  marketId: number | null;
  outcomeIndex: number | null;
};

export function parseKey(key: string): ParsedKey {
  const [kind, owner, m, o] = key.split("|");
  return {
    kind: kind as AccountKind,
    owner,
    marketId: m === "" || m === undefined ? null : Number(m),
    outcomeIndex: o === "" || o === undefined ? null : Number(o),
  };
}
