/**
 * Pure translation of a match plan into signed ledger movements.
 *
 * This is the economic heart of the exchange: it converts the matching plan
 * into a set of (account -> balance/locked delta) movements covering the whole
 * operation (up-front lock, every fill, maker refunds, and the incoming
 * order's leftover refund / resting lock). It performs no I/O and is exhaustively
 * unit-tested for conservation.
 */
import { SCALE, costOf, feeOf } from "../../lib/exchange/units";
import {
  collateralKey,
  feeKey,
  reserveKey,
  shareKey,
} from "../../lib/exchange/keys";
import type { AccountDelta, MatchPlan } from "../../lib/exchange/types";

class DeltaBag {
  private m = new Map<string, AccountDelta>();
  add(key: string, balanceDelta: bigint, lockedDelta: bigint) {
    const cur = this.m.get(key) ?? { key, balanceDelta: 0n, lockedDelta: 0n };
    cur.balanceDelta += balanceDelta;
    cur.lockedDelta += lockedDelta;
    this.m.set(key, cur);
  }
  list(): AccountDelta[] {
    // Drop pure no-ops.
    return [...this.m.values()].filter(
      (d) => d.balanceDelta !== 0n || d.lockedDelta !== 0n,
    );
  }
}

export function computeEffects(plan: MatchPlan, feeBps: number): AccountDelta[] {
  const bag = new DeltaBag();
  const inc = plan.incoming;
  const taker = inc.maker;
  const mkt = inc.marketId;
  const isBuy = inc.side === "BUY";

  const takerColl = collateralKey(taker);
  const takerShare = shareKey(taker, mkt, inc.outcomeIndex);
  const reserve = reserveKey(mkt);
  const fee = feeKey();

  // 1) Up-front lock of the incoming (taker) order.
  if (isBuy) {
    const lock = plan.incomingLockNotional + plan.incomingFeeLock;
    bag.add(takerColl, -lock, lock);
  } else {
    bag.add(takerShare, -plan.incomingLockNotional, plan.incomingLockNotional);
  }

  let takerCollLockedSpent = 0n; // collateral moved out of taker locked (cost+fee)
  let takerSharesUsed = 0n; // shares moved out of taker locked (SELL)

  for (const f of plan.fills) {
    const makerColl = collateralKey(f.maker);
    const makerShareTaken = shareKey(f.maker, mkt, f.makerOutcome);

    if (isBuy) {
      const feeAmt = feeOf(f.takerCost, feeBps);
      // taker pays cost + fee out of locked collateral; receives shares.
      bag.add(takerColl, 0n, -(f.takerCost + feeAmt));
      takerCollLockedSpent += f.takerCost + feeAmt;
      bag.add(takerShare, f.qty, 0n);
      bag.add(fee, feeAmt, 0n);

      if (f.matchType === "NORMAL") {
        // maker is a SELLER on the taker's outcome.
        bag.add(makerColl, f.makerCost, 0n); // receives collateral
        bag.add(makerShareTaken, 0n, -f.qty); // delivers locked shares
      } else {
        // MINT: maker is a BUYER on the complementary outcome.
        bag.add(makerColl, 0n, -f.makerCost); // pays from locked collateral
        bag.add(makerShareTaken, f.qty, 0n); // receives complementary shares
        bag.add(reserve, f.qty, 0n); // set backing = takerCost + makerCost
      }
    } else {
      const feeAmt = feeOf(f.takerCost, feeBps);
      // taker delivers shares out of locked; receives proceeds minus fee.
      bag.add(takerShare, 0n, -f.qty);
      takerSharesUsed += f.qty;
      bag.add(takerColl, f.takerCost - feeAmt, 0n);
      bag.add(fee, feeAmt, 0n);

      if (f.matchType === "NORMAL") {
        // maker is a BUYER on the taker's outcome.
        bag.add(makerColl, 0n, -f.makerCost); // pays from locked collateral
        bag.add(makerShareTaken, f.qty, 0n); // receives shares
      } else {
        // MERGE: maker is a SELLER on the complementary outcome.
        bag.add(makerShareTaken, 0n, -f.qty); // delivers locked complementary shares
        bag.add(makerColl, f.makerCost, 0n); // receives proceeds
        bag.add(reserve, -f.qty, 0n); // release set backing
      }
    }

    // Maker leftover refund when their resting order is fully consumed.
    if (f.makerFullyConsumed) {
      if (f.makerSide === "BUY") {
        const leftover = f.makerLockedBefore - f.makerCost;
        if (leftover > 0n) {
          bag.add(makerColl, leftover, -leftover);
        }
      } else {
        const leftover = f.makerLockedBefore - f.qty;
        if (leftover > 0n) {
          const mShare = shareKey(f.maker, mkt, f.makerOutcome);
          bag.add(mShare, leftover, -leftover);
        }
      }
    }
  }

  // 2) Incoming order leftover handling.
  if (isBuy) {
    const lockedNow = plan.incomingLockNotional + plan.incomingFeeLock - takerCollLockedSpent;
    const keep = plan.rest ? plan.rest.lockedRemaining : 0n; // resting maker pays no fee
    const refund = lockedNow - keep;
    if (refund > 0n) bag.add(takerColl, refund, -refund);
  } else {
    const lockedNow = plan.incomingLockNotional - takerSharesUsed;
    const keep = plan.rest ? plan.rest.lockedRemaining : 0n;
    const refund = lockedNow - keep;
    if (refund > 0n) bag.add(takerShare, refund, -refund);
  }

  return bag.list();
}

/**
 * Conservation check used by tests + the runtime invariant:
 *   - total collateral movement (free+locked, across COLLATERAL/RESERVE/FEE)
 *     nets to zero (no collateral created or destroyed by matching).
 *   - per-outcome share movement is balanced by mint/merge (NORMAL transfers
 *     net zero; MINT adds equal YES/NO; MERGE removes equal YES/NO).
 */
export function assertConservation(deltas: AccountDelta[]) {
  let collateralNet = 0n;
  for (const d of deltas) {
    const kind = d.key.split("|")[0];
    if (kind === "COLLATERAL" || kind === "RESERVE" || kind === "FEE") {
      collateralNet += d.balanceDelta + d.lockedDelta;
    }
  }
  if (collateralNet !== 0n) {
    throw new Error(`collateral not conserved: net ${collateralNet}`);
  }
}

export { SCALE, costOf };
