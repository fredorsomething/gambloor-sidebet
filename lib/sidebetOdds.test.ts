import assert from "node:assert/strict";

import {
  clampOddsPercent,
  formatCalculatedStake,
  oddsPercentFromStakes,
  theirStakeFromYoursAndOdds,
  yourStakeFromTheirsAndOdds,
} from "./sidebetOdds";

assert.equal(oddsPercentFromStakes(4, 1), 80);
assert.equal(theirStakeFromYoursAndOdds(4, 80), 1);
assert.equal(yourStakeFromTheirsAndOdds(1, 80), 4);
assert.equal(clampOddsPercent(120), 99);
assert.equal(clampOddsPercent(0.5), 1);
assert.equal(formatCalculatedStake(1.5), "1.5");
assert.equal(formatCalculatedStake(100), "100");

console.log("sidebetOdds.test.ts passed");
