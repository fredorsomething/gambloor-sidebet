/**
 * Standalone matching-engine tests. Run with `npm run engine:test`.
 *
 * Uses a tiny in-process ledger to verify that the pure matching plan +
 * ledger effects keep collateral conserved, shares non-negative, and the
 * binary solvency invariant (outstanding YES == outstanding NO == reserve)
 * intact across NORMAL / MINT / MERGE fills.
 */
import { MarketBook } from "./orderbook";
import { assertConservation, computeEffects } from "./effects";
import { SCALE, costOf, type Side } from "../../lib/exchange/units";
import {
  collateralKey,
  feeKey,
  reserveKey,
  shareKey,
} from "../../lib/exchange/keys";
import type { IncomingOrder, MatchPlan, RestingOrder } from "../../lib/exchange/types";

type Bal = { balance: bigint; locked: bigint };
type Ledger = Map<string, Bal>;

let passed = 0;
function ok(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  passed++;
}
function eq(a: bigint, b: bigint, msg: string) {
  ok(a === b, `${msg} (got ${a}, want ${b})`);
}

function acc(l: Ledger, key: string): Bal {
  let v = l.get(key);
  if (!v) {
    v = { balance: 0n, locked: 0n };
    l.set(key, v);
  }
  return v;
}

function seedCollateral(l: Ledger, addr: string, amount: bigint) {
  acc(l, collateralKey(addr)).balance += amount;
}

function apply(l: Ledger, deltas: ReturnType<typeof computeEffects>) {
  for (const d of deltas) {
    const a = acc(l, d.key);
    a.balance += d.balanceDelta;
    a.locked += d.lockedDelta;
  }
}

function assertNonNegative(l: Ledger) {
  for (const [k, v] of l) {
    ok(v.balance >= 0n, `balance >= 0 for ${k}`);
    ok(v.locked >= 0n, `locked >= 0 for ${k}`);
  }
}

function outstanding(l: Ledger, addrs: string[], marketId: number, outcome: number): bigint {
  let s = 0n;
  for (const a of addrs) {
    const v = l.get(shareKey(a, marketId, outcome));
    if (v) s += v.balance + v.locked;
  }
  return s;
}

function assertBinaryInvariant(l: Ledger, addrs: string[], marketId: number) {
  const yes = outstanding(l, addrs, marketId, 0);
  const no = outstanding(l, addrs, marketId, 1);
  const reserve = (l.get(reserveKey(marketId))?.balance ?? 0n);
  eq(yes, no, "outstanding YES == NO");
  eq(yes, reserve, "outstanding shares == reserve");
}

function incoming(p: Partial<IncomingOrder> & {
  maker: string;
  side: Side;
  outcomeIndex: number;
  price: bigint;
  qty: bigint;
}): IncomingOrder {
  return {
    marketId: p.marketId ?? 1,
    maker: p.maker,
    side: p.side,
    outcomeIndex: p.outcomeIndex,
    type: p.type ?? "LIMIT",
    price: p.price,
    qty: p.qty,
  };
}

/** Place an order: plan, check conservation, apply to ledger + book. */
function place(book: MarketBook, l: Ledger, o: IncomingOrder, feeBps = 0): MatchPlan {
  const plan = book.planMatch(o, feeBps);
  const deltas = computeEffects(plan, feeBps);
  assertConservation(deltas);
  apply(l, deltas);
  book.applyPlan(plan);
  assertNonNegative(l);
  return plan;
}

const A = "0xaaaa000000000000000000000000000000000001";
const B = "0xbbbb000000000000000000000000000000000002";
const C = "0xcccc000000000000000000000000000000000003";
const ADDRS = [A, B, C];
const M = 1;

function test_normal_full_fill() {
  const book = new MarketBook(M, 2);
  const l: Ledger = new Map();
  seedCollateral(l, A, 10n * SCALE);
  seedCollateral(l, B, 10n * SCALE);

  // A and B both mint 5 shares of YES/NO via complementary buys to create inventory.
  place(book, l, incoming({ maker: A, side: "BUY", outcomeIndex: 1, price: 400_000n, qty: 5n * SCALE }));
  place(book, l, incoming({ maker: B, side: "BUY", outcomeIndex: 0, price: 600_000n, qty: 5n * SCALE }));
  // Now B holds 5 YES, A holds 5 NO, reserve = 5.
  assertBinaryInvariant(l, ADDRS, M);
  eq(acc(l, shareKey(B, M, 0)).balance, 5n * SCALE, "B holds 5 YES after mint");

  // C buys; B places a SELL ask of YES at 0.55.
  seedCollateral(l, C, 10n * SCALE);
  place(book, l, incoming({ maker: B, side: "SELL", outcomeIndex: 0, price: 550_000n, qty: 5n * SCALE }));
  const plan = place(book, l, incoming({ maker: C, side: "BUY", outcomeIndex: 0, price: 600_000n, qty: 2n * SCALE }));

  ok(plan.fills.length === 1 && plan.fills[0].matchType === "NORMAL", "one NORMAL fill");
  eq(plan.fills[0].takerPrice, 550_000n, "executes at maker ask 0.55");
  eq(acc(l, shareKey(C, M, 0)).balance, 2n * SCALE, "C receives 2 YES");
  // C paid 2 * 0.55 = 1.1 collateral.
  eq(costOf(550_000n, 2n * SCALE), 1_100_000n, "cost helper");
  eq(acc(l, collateralKey(C)).balance, 10n * SCALE - 1_100_000n, "C debited 1.1");
  assertBinaryInvariant(l, ADDRS, M);
}

function test_mint() {
  const book = new MarketBook(M, 2);
  const l: Ledger = new Map();
  seedCollateral(l, A, 10n * SCALE);
  seedCollateral(l, B, 10n * SCALE);

  // A rests a BUY on NO (outcome 1) at 0.4. B takes BUY YES (outcome 0) at 0.65
  // -> complementary mint (0.4 + 0.6 effective). effective ask to B = 1 - 0.4 = 0.6 <= 0.65.
  place(book, l, incoming({ maker: A, side: "BUY", outcomeIndex: 1, price: 400_000n, qty: 3n * SCALE }));
  const plan = place(book, l, incoming({ maker: B, side: "BUY", outcomeIndex: 0, price: 650_000n, qty: 3n * SCALE }));

  ok(plan.fills.length === 1 && plan.fills[0].matchType === "MINT", "MINT fill");
  eq(plan.fills[0].takerPrice, 600_000n, "B effective price 0.6");
  eq(acc(l, shareKey(B, M, 0)).balance, 3n * SCALE, "B gets 3 YES");
  eq(acc(l, shareKey(A, M, 1)).balance, 3n * SCALE, "A gets 3 NO");
  eq(acc(l, reserveKey(M)).balance, 3n * SCALE, "reserve = 3");
  // A paid 0.4*3 = 1.2 ; B paid 0.6*3 = 1.8 ; total = 3 reserve.
  eq(acc(l, collateralKey(A)).balance, 10n * SCALE - 1_200_000n, "A paid 1.2");
  eq(acc(l, collateralKey(B)).balance, 10n * SCALE - 1_800_000n, "B paid 1.8");
  assertBinaryInvariant(l, ADDRS, M);
}

function test_merge() {
  const book = new MarketBook(M, 2);
  const l: Ledger = new Map();
  seedCollateral(l, A, 10n * SCALE);
  seedCollateral(l, B, 10n * SCALE);

  // Mint: A buys NO @0.4, B buys YES @0.6 -> B has YES, A has NO, reserve 4.
  place(book, l, incoming({ maker: A, side: "BUY", outcomeIndex: 1, price: 400_000n, qty: 4n * SCALE }));
  place(book, l, incoming({ maker: B, side: "BUY", outcomeIndex: 0, price: 600_000n, qty: 4n * SCALE }));
  assertBinaryInvariant(l, ADDRS, M);

  // A rests SELL NO @0.45. B takes SELL YES @0.5 -> merge: effective bid to B = 1-0.45=0.55 >= 0.5.
  place(book, l, incoming({ maker: A, side: "SELL", outcomeIndex: 1, price: 450_000n, qty: 4n * SCALE }));
  const plan = place(book, l, incoming({ maker: B, side: "SELL", outcomeIndex: 0, price: 500_000n, qty: 4n * SCALE }));

  ok(plan.fills.length === 1 && plan.fills[0].matchType === "MERGE", "MERGE fill");
  eq(acc(l, reserveKey(M)).balance, 0n, "reserve drained to 0");
  eq(acc(l, shareKey(B, M, 0)).balance, 0n, "B YES burned");
  eq(acc(l, shareKey(A, M, 1)).balance, 0n, "A NO burned");
  // A minted NO @0.4*4 = 1.6 spent; merge proceeds @0.45*4 = 1.8.
  // B proceeds = (1-0.45)*4 = 2.2 ; A proceeds = 1.8 ; total 4 released.
  eq(acc(l, collateralKey(A)).balance, 10n * SCALE - 1_600_000n + 1_800_000n, "A merge proceeds");
  assertBinaryInvariant(l, ADDRS, M);
}

function test_partial_and_rest() {
  const book = new MarketBook(M, 2);
  const l: Ledger = new Map();
  seedCollateral(l, A, 100n * SCALE);
  seedCollateral(l, B, 100n * SCALE);

  // Build A inventory of YES via mint with B.
  place(book, l, incoming({ maker: B, side: "BUY", outcomeIndex: 1, price: 500_000n, qty: 10n * SCALE }));
  place(book, l, incoming({ maker: A, side: "BUY", outcomeIndex: 0, price: 500_000n, qty: 10n * SCALE }));
  eq(acc(l, shareKey(A, M, 0)).balance, 10n * SCALE, "A has 10 YES");

  // A sells 4 YES @0.5 (rests). B buys 10 YES @0.5 -> fills 4, rests 6 as a bid.
  place(book, l, incoming({ maker: A, side: "SELL", outcomeIndex: 0, price: 500_000n, qty: 4n * SCALE }));
  const plan = place(book, l, incoming({ maker: B, side: "BUY", outcomeIndex: 0, price: 500_000n, qty: 10n * SCALE }));
  eq(plan.filledQty, 4n * SCALE, "filled 4");
  ok(plan.rest !== null && plan.rest!.remaining === 6n * SCALE, "rests 6");
  eq(acc(l, shareKey(B, M, 0)).balance, 4n * SCALE, "B got 4 YES");
  // B locked for the resting 6 @0.5 = 3.0 collateral.
  eq(acc(l, collateralKey(B)).locked, costOf(500_000n, 6n * SCALE), "B locked for resting bid");
  assertBinaryInvariant(l, ADDRS, M);
}

function test_self_trade_prevention() {
  const book = new MarketBook(M, 2);
  const l: Ledger = new Map();
  seedCollateral(l, A, 100n * SCALE);
  // A rests a BUY NO; A takes BUY YES that would otherwise MINT against itself.
  place(book, l, incoming({ maker: A, side: "BUY", outcomeIndex: 1, price: 400_000n, qty: 5n * SCALE }));
  const plan = place(book, l, incoming({ maker: A, side: "BUY", outcomeIndex: 0, price: 700_000n, qty: 5n * SCALE }));
  eq(plan.filledQty, 0n, "no self match");
  ok(plan.rest !== null, "rests instead");
}

function test_price_time_priority() {
  const book = new MarketBook(M, 2);
  const l: Ledger = new Map();
  seedCollateral(l, A, 100n * SCALE);
  seedCollateral(l, B, 100n * SCALE);
  seedCollateral(l, C, 100n * SCALE);
  // Give A and B YES inventory.
  place(book, l, incoming({ maker: C, side: "BUY", outcomeIndex: 1, price: 500_000n, qty: 20n * SCALE }));
  place(book, l, incoming({ maker: A, side: "BUY", outcomeIndex: 0, price: 500_000n, qty: 10n * SCALE }));
  place(book, l, incoming({ maker: C, side: "BUY", outcomeIndex: 1, price: 500_000n, qty: 10n * SCALE }));
  place(book, l, incoming({ maker: B, side: "BUY", outcomeIndex: 0, price: 500_000n, qty: 10n * SCALE }));

  // A asks 0.60, B asks 0.55. A taker buying should hit B (better price) first.
  place(book, l, incoming({ maker: A, side: "SELL", outcomeIndex: 0, price: 600_000n, qty: 5n * SCALE }));
  place(book, l, incoming({ maker: B, side: "SELL", outcomeIndex: 0, price: 550_000n, qty: 5n * SCALE }));
  const plan = place(book, l, incoming({ maker: C, side: "BUY", outcomeIndex: 0, price: 600_000n, qty: 3n * SCALE }));
  ok(plan.fills.length === 1, "one fill");
  eq(plan.fills[0].takerPrice, 550_000n, "took best (B @0.55) first");
}

function test_fees() {
  const book = new MarketBook(M, 2);
  const l: Ledger = new Map();
  seedCollateral(l, A, 100n * SCALE);
  seedCollateral(l, B, 100n * SCALE);
  // Inventory for A.
  place(book, l, incoming({ maker: B, side: "BUY", outcomeIndex: 1, price: 500_000n, qty: 10n * SCALE }), 0);
  place(book, l, incoming({ maker: A, side: "BUY", outcomeIndex: 0, price: 500_000n, qty: 10n * SCALE }), 0);
  place(book, l, incoming({ maker: A, side: "SELL", outcomeIndex: 0, price: 500_000n, qty: 5n * SCALE }), 0);

  const feeBps = 200; // 2%
  const before = acc(l, feeKey()).balance;
  const plan = place(book, l, incoming({ maker: B, side: "BUY", outcomeIndex: 0, price: 500_000n, qty: 4n * SCALE }), feeBps);
  const cost = costOf(500_000n, 4n * SCALE); // 2.0
  const expectedFee = (cost * 200n) / 10_000n;
  eq(acc(l, feeKey()).balance - before, expectedFee, "fee credited to house");
  ok(plan.fills.length === 1, "filled");
  assertBinaryInvariant(l, ADDRS, M);
}

function run() {
  const tests = [
    test_normal_full_fill,
    test_mint,
    test_merge,
    test_partial_and_rest,
    test_self_trade_prevention,
    test_price_time_priority,
    test_fees,
  ];
  for (const t of tests) {
    t();
    console.log(`  ok  ${t.name}`);
  }
  console.log(`\nAll matching-engine tests passed (${passed} assertions).`);
}

run();
