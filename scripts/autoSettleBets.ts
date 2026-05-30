import "dotenv/config";

import {
  autoSettleEligibleBets,
  autoSettleDiagnostics,
  autoSettleEnabled,
  platformAutoSettleReady,
} from "../lib/autoSettle";
import { ADMIN_ADDRESS } from "../lib/admin";

/**
 * Cron-friendly worker: settle matched admin-settler bets where both parties
 * declared the same outcome. Run as the admin settler wallet:
 *   npm run auto-settle
 */
async function main() {
  if (!autoSettleEnabled()) {
    throw new Error(
      "SETTLER_PRIVATE_KEY / AUTO_SETTLE_PRIVATE_KEY / ADMIN_PRIVATE_KEY not set or invalid",
    );
  }
  if (!platformAutoSettleReady()) {
    const d = autoSettleDiagnostics();
    throw new Error(
      `SETTLER_PRIVATE_KEY derives ${d.signerAddress} but platform settler is ${ADMIN_ADDRESS}`,
    );
  }

  const results = await autoSettleEligibleBets();
  const settled = results.filter((r) => r.ok);
  const skipped = results.filter((r) => !r.ok);

  console.log(`\nAuto-settle complete: ${settled.length} settled, ${skipped.length} skipped`);
  for (const r of settled) {
    if (r.ok) console.log(`  ✓ bet #${r.betId} → ${r.hash}`);
  }
  for (const r of skipped) {
    if (!r.ok) console.log(`  · bet #${r.betId}: ${r.reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
