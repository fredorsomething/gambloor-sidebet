import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Wipes all custodial CLOB state for a clean-slate rebuild: markets, outcomes,
 * the ledger (accounts + journal), fills, stats, deposits and withdrawals.
 *
 * Sidebets (Bet / BetNegotiation) and social data (profiles, chat, DMs) are
 * left untouched. Run with `npm run db:reset-clob`.
 *
 * The matching engine's Redis book must be flushed separately (FLUSHDB on the
 * engine's Redis), otherwise it will rehydrate stale orders on boot.
 */
const prisma = new PrismaClient();

async function main() {
  if (process.env.CONFIRM_RESET !== "yes") {
    console.error(
      "Refusing to run without CONFIRM_RESET=yes.\n" +
        "This deletes ALL markets, the ledger, fills, deposits and withdrawals.\n" +
        "Re-run as: CONFIRM_RESET=yes npm run db:reset-clob",
    );
    process.exit(1);
  }

  // Order matters only where there are no cascades; ledger lines cascade from
  // both LedgerTx and Account, fills/stats/outcomes cascade from Market.
  const ledgerLines = await prisma.ledgerLine.deleteMany({});
  const ledgerTxs = await prisma.ledgerTx.deleteMany({});
  const accounts = await prisma.account.deleteMany({});
  const fills = await prisma.fill.deleteMany({});
  const stats = await prisma.outcomeStat.deleteMany({});
  const outcomes = await prisma.marketOutcome.deleteMany({});
  const markets = await prisma.market.deleteMany({});
  const deposits = await prisma.deposit.deleteMany({});
  const withdrawals = await prisma.withdrawal.deleteMany({});

  console.log("CLOB state wiped:");
  console.table({
    ledgerLines: ledgerLines.count,
    ledgerTxs: ledgerTxs.count,
    accounts: accounts.count,
    fills: fills.count,
    stats: stats.count,
    outcomes: outcomes.count,
    markets: markets.count,
    deposits: deposits.count,
    withdrawals: withdrawals.count,
  });
  console.log("\nRemember to FLUSHDB the engine's Redis to clear the live book.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
