import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { ExchangeEngine } from "./manager";
import { RedisStore, createRedis } from "./redisStore";
import { collateralKey, reserveKey, shareKey } from "../lib/exchange/keys";

/**
 * End-to-end rollout smoke test against the REAL ledger + engine + Redis path.
 *
 *   deposit -> trade (mint) -> settle -> withdraw, asserting the solvency
 *   invariant after every step.
 *
 * It creates its own throwaway market + test users, runs the full lifecycle,
 * then deletes everything it created (its market cascades outcomes/fills/stats;
 * its ledger txs, accounts, deposits and withdrawals are removed explicitly).
 * It NEVER touches pre-existing markets or users.
 *
 * Requires a reachable DATABASE_URL + REDIS_URL. Guarded behind CONFIRM_E2E=yes
 * so it can't be run by accident. The on-chain withdrawal send is simulated
 * (no real USDC.e leaves any wallet); only the ledger side is exercised.
 *
 *   CONFIRM_E2E=yes npm run engine:e2e
 */

const SCALE = 1_000_000n;
const USER_A = "0x" + "a".repeat(40);
const USER_B = "0x" + "b".repeat(40);
const SETTLER = "0x" + "c".repeat(40);

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  if (process.env.CONFIRM_E2E !== "yes") {
    console.error(
      "Refusing to run without CONFIRM_E2E=yes.\n" +
        "Run as: CONFIRM_E2E=yes npm run engine:e2e\n" +
        "Use a staging DATABASE_URL/REDIS_URL — it writes ledger rows for test users.",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const redis = createRedis();
  const store = new RedisStore(redis);
  const engine = new ExchangeEngine(prisma, store);

  let marketId = -1;
  const log = (s: string) => console.log(`  ${s}`);

  try {
    // 1) Create a throwaway binary market, Open for trading.
    const market = await prisma.market.create({
      data: {
        chainId: 137,
        exchangeAddress: "0x0000000000000000000000000000000000000000",
        ctfAddress: "0x0000000000000000000000000000000000000000",
        conditionId: `0xe2e${Date.now().toString(16).padStart(61, "0")}`,
        questionId: `0xe2e${Date.now().toString(16).padStart(61, "0")}`,
        creator: USER_A,
        settler: SETTLER,
        feeBps: 200,
        token: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        tokenSymbol: "USDC.e",
        decimals: 6,
        title: "[e2e] rollout smoke test",
        description: "throwaway",
        terms: "throwaway",
        termsHash: `0xe2e${Date.now().toString(16).padStart(61, "0")}`,
        nonce: `e2e-${Date.now()}`,
        status: "Open",
        outcomes: {
          create: [
            { index: 0, label: "Yes", positionId: "1" },
            { index: 1, label: "No", positionId: "2" },
          ],
        },
      },
    });
    marketId = market.id;
    log(`created market #${marketId} (Open, fee 200bps)`);
    await engine.ensureMarket(marketId);

    // 2) Deposit 100 USDC.e to each user.
    await engine.ledger.creditDeposit({
      address: USER_A,
      amount: 100n * SCALE,
      txHash: `0xe2eA${marketId}`,
      logIndex: 0,
      chainId: 137,
    });
    await engine.ledger.creditDeposit({
      address: USER_B,
      amount: 100n * SCALE,
      txHash: `0xe2eB${marketId}`,
      logIndex: 0,
      chainId: 137,
    });
    const aBal0 = await engine.ledger.getCollateral(USER_A);
    const bBal0 = await engine.ledger.getCollateral(USER_B);
    assert(aBal0.balance === 100n * SCALE, "A funded 100");
    assert(bBal0.balance === 100n * SCALE, "B funded 100");
    log(`deposited 100 USDC.e to A and B`);

    // 3) Trade: A buys 10 YES @ 0.60, B buys 10 NO @ 0.40 -> MINT a complete set.
    const qty = 10n * SCALE;
    const aPlace = await engine.placeOrder({
      marketId,
      maker: USER_A,
      side: "BUY",
      outcomeIndex: 0,
      type: "LIMIT",
      price: 600_000n,
      qty,
    });
    log(`A placed BUY 10 YES @0.60 -> filled ${aPlace.filledQty} (rest ${aPlace.restId})`);

    const bPlace = await engine.placeOrder({
      marketId,
      maker: USER_B,
      side: "BUY",
      outcomeIndex: 1,
      type: "LIMIT",
      price: 400_000n,
      qty,
    });
    log(`B placed BUY 10 NO @0.40 -> filled ${bPlace.filledQty}`);
    assert(BigInt(bPlace.filledQty) === qty, "B fully filled via MINT");
    assert(bPlace.fills.some((f) => f.matchType === "MINT"), "match was a MINT");

    await engine.ledger.assertSolvency(marketId, 2);

    const aShares = await engine.ledger.getShares(USER_A, marketId);
    const bShares = await engine.ledger.getShares(USER_B, marketId);
    assert((aShares[0]?.balance ?? 0n) === qty, "A holds 10 YES");
    assert((bShares[0]?.balance ?? 0n) === qty, "B holds 10 NO");
    const aBal1 = await engine.ledger.getCollateral(USER_A);
    const bBal1 = await engine.ledger.getCollateral(USER_B);
    // A paid 0.6*10 = 6 (+ fee), B paid 0.4*10 = 4 (+ fee). Reserve = 10.
    assert(aBal1.balance <= 94n * SCALE, "A spent >=6 on YES");
    assert(bBal1.balance <= 96n * SCALE, "B spent >=4 on NO");
    log(`post-trade solvency OK; A=${fmt(aBal1.balance)} B=${fmt(bBal1.balance)} USDC free`);

    // 4) Settle: YES (outcome 0) wins. A's 10 YES redeem to 10 USDC; B's NO -> 0.
    await engine.settleMarket(marketId, 0);
    await engine.ledger.assertSolvency(marketId, 2);
    const aBal2 = await engine.ledger.getCollateral(USER_A);
    assert(aBal2.balance === aBal1.balance + qty, "A redeemed 10 USDC from winning YES");
    const aSharesAfter = await engine.ledger.getShares(USER_A, marketId);
    assert((aSharesAfter[0]?.balance ?? 0n) === 0n, "A's shares zeroed after settle");
    const reserve = await prisma.account.findUnique({
      where: { key: reserveKey(marketId) },
      select: { balance: true, locked: true },
    });
    assert((reserve?.balance ?? 0n) + (reserve?.locked ?? 0n) === 0n, "reserve drained");
    log(`settled YES; A=${fmt(aBal2.balance)} USDC free, reserve drained`);

    // 5) Withdraw: A requests 50 USDC (no fee); simulate the bridge completing it.
    const w = await engine.ledger.requestWithdrawal({
      address: USER_A,
      amount: 50n * SCALE,
      fee: 0n,
      status: "Processing",
    });
    const aAfterReq = await engine.ledger.getCollateral(USER_A);
    assert(aAfterReq.locked >= 50n * SCALE, "withdrawal locked 50");
    await engine.ledger.completeWithdrawal(w.id, "0xsimulated_bridge_tx");
    const aFinal = await engine.ledger.getCollateral(USER_A);
    assert(aFinal.balance === aBal2.balance - 50n * SCALE, "free balance dropped by 50");
    assert(aFinal.locked === aAfterReq.locked - 50n * SCALE, "locked cleared on send");
    log(`withdrew 50 USDC; A final free=${fmt(aFinal.balance)} locked=${fmt(aFinal.locked)}`);

    console.log("\n✅ e2e PASSED: deposit -> trade(mint) -> settle -> withdraw, solvency held.");
  } finally {
    // Cleanup everything this run created. Market cascade removes outcomes,
    // fills and stats. Remove the ledger + balances for the test scope only.
    if (marketId > 0) {
      const keys = [
        collateralKey(USER_A),
        collateralKey(USER_B),
        reserveKey(marketId),
        shareKey(USER_A, marketId, 0),
        shareKey(USER_A, marketId, 1),
        shareKey(USER_B, marketId, 0),
        shareKey(USER_B, marketId, 1),
      ];
      // LedgerLines cascade from Account + LedgerTx; delete txs for this market
      // and the global (deposit/withdrawal) txs referencing our test accounts.
      await prisma.ledgerLine.deleteMany({
        where: { account: { key: { in: keys } } },
      });
      await prisma.ledgerTx.deleteMany({ where: { marketId } });
      await prisma.account.deleteMany({ where: { key: { in: keys } } });
      await prisma.deposit.deleteMany({
        where: { address: { in: [USER_A.toLowerCase(), USER_B.toLowerCase()] } },
      });
      await prisma.withdrawal.deleteMany({
        where: { address: { in: [USER_A.toLowerCase(), USER_B.toLowerCase()] } },
      });
      await prisma.market.delete({ where: { id: marketId } }).catch(() => {});
      await store.clearMarket(marketId).catch(() => {});
    }
    await redis.quit().catch(() => {});
    await prisma.$disconnect();
  }
}

function fmt(micro: bigint): string {
  return (Number(micro) / 1_000_000).toFixed(2);
}

main().catch((err) => {
  console.error("\n❌ e2e FAILED:", err);
  process.exit(1);
});
