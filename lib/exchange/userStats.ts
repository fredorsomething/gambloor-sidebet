/**
 * Server-side helpers to derive a user's positions and realized PnL from the
 * durable Fill history. The ledger (Account) is authoritative for current
 * holdings; fills are replayed for average cost basis and realized PnL.
 */
import type { Side } from "./units";

export type FillRowLike = {
  marketId: number;
  matchType: string;
  qty: bigint;
  price: bigint;
  taker: string;
  takerSide: string;
  takerOutcome: number;
  takerCost: bigint;
  takerFee: bigint;
  maker: string;
  makerSide: string;
  makerOutcome: number;
  makerCost: bigint;
  createdAt: Date;
};

export type UserLeg = {
  marketId: number;
  outcome: number;
  side: Side;
  shares: bigint; // micro-shares acquired (BUY) or sold (SELL)
  cost: bigint; // micro-USDC paid (BUY) or received (SELL), pre-fee
  fee: bigint; // taker fee (micro-USDC)
  t: number; // ms epoch
};

/** Extract this user's economic leg(s) from a set of fills, oldest first. */
export function userLegs(fills: FillRowLike[], address: string): UserLeg[] {
  const lower = address.toLowerCase();
  const legs: UserLeg[] = [];
  for (const f of fills) {
    if (f.taker.toLowerCase() === lower) {
      legs.push({
        marketId: f.marketId,
        outcome: f.takerOutcome,
        side: f.takerSide as Side,
        shares: f.qty,
        cost: f.takerCost,
        fee: f.takerFee,
        t: f.createdAt.getTime(),
      });
    }
    if (f.maker.toLowerCase() === lower) {
      legs.push({
        marketId: f.marketId,
        outcome: f.makerOutcome,
        side: f.makerSide as Side,
        shares: f.qty,
        cost: f.makerCost,
        fee: 0n, // makers pay no taker fee
        t: f.createdAt.getTime(),
      });
    }
  }
  legs.sort((a, b) => a.t - b.t);
  return legs;
}

export type PositionAcc = { qty: bigint; cost: bigint };
export type RealizedEvent = { t: number; delta: number; marketId: number; outcome: number };

/**
 * Replay legs to running average cost. Returns final position per
 * `marketId:outcome` and the realized-PnL events from SELLs.
 */
export function replay(legs: UserLeg[]): {
  positions: Map<string, PositionAcc>;
  realized: RealizedEvent[];
} {
  const positions = new Map<string, PositionAcc>();
  const realized: RealizedEvent[] = [];
  for (const leg of legs) {
    const key = `${leg.marketId}:${leg.outcome}`;
    const acc = positions.get(key) ?? { qty: 0n, cost: 0n };
    if (leg.side === "BUY") {
      acc.qty += leg.shares;
      acc.cost += leg.cost + leg.fee; // fees fold into cost basis
      positions.set(key, acc);
    } else {
      const sold = leg.shares > acc.qty ? acc.qty : leg.shares;
      const avgCostOut = acc.qty > 0n ? (acc.cost * sold) / acc.qty : 0n;
      const proceeds = leg.cost - leg.fee;
      // Realized PnL on the sold portion (scaled proceeds to the matched qty).
      const matchedProceeds = leg.shares > 0n ? (proceeds * sold) / leg.shares : 0n;
      const realizedMicro = matchedProceeds - avgCostOut;
      acc.qty -= sold;
      acc.cost -= avgCostOut;
      positions.set(key, acc);
      if (realizedMicro !== 0n) {
        realized.push({
          t: leg.t,
          delta: Number(realizedMicro) / 1_000_000,
          marketId: leg.marketId,
          outcome: leg.outcome,
        });
      }
    }
  }
  return { positions, realized };
}
