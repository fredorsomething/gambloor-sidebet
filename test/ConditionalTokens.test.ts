import { expect } from "chai";
import hre from "hardhat";
import { keccak256, parseUnits, toHex } from "viem";

async function setup() {
  const [deployer, settler, alice] = await hre.viem.getWalletClients();
  const token = await hre.viem.deployContract("MockERC20", []);
  const ctf = await hre.viem.deployContract("ConditionalTokens", []);
  await token.write.mint([alice.account.address, parseUnits("1000", 6)]);
  await token.write.approve([ctf.address, parseUnits("1000", 6)], {
    account: alice.account,
  });
  return { deployer, settler, alice, token, ctf };
}

describe("ConditionalTokens", () => {
  it("splits, merges, reports, and redeems", async () => {
    const { settler, alice, token, ctf } = await setup();
    const questionId = keccak256(toHex("q1"));
    const outcomes = 2;

    await ctf.write.prepareCondition([
      settler.account.address,
      token.address,
      questionId,
      outcomes,
    ]);
    const conditionId = await ctf.read.getConditionId([
      settler.account.address,
      questionId,
      outcomes,
    ]);

    const amt = parseUnits("100", 6);
    await ctf.write.splitPosition([conditionId, amt], { account: alice.account });

    const pos0 = await ctf.read.getPositionId([conditionId, token.address, 0]);
    const pos1 = await ctf.read.getPositionId([conditionId, token.address, 1]);
    expect(await ctf.read.balanceOf([pos0, alice.account.address])).to.equal(amt);
    expect(await ctf.read.balanceOf([pos1, alice.account.address])).to.equal(amt);

    // Merge half back.
    await ctf.write.mergePositions([conditionId, parseUnits("40", 6)], {
      account: alice.account,
    });
    expect(await ctf.read.balanceOf([pos0, alice.account.address])).to.equal(
      parseUnits("60", 6),
    );

    // Report outcome 0 and redeem.
    await ctf.write.reportPayouts([conditionId, 0], { account: settler.account });
    const before = await token.read.balanceOf([alice.account.address]);
    await ctf.write.redeemPositions([conditionId], { account: alice.account });
    const after = await token.read.balanceOf([alice.account.address]);
    expect(after - before).to.equal(parseUnits("60", 6));
    // Losing shares remain but are worthless.
    expect(await ctf.read.balanceOf([pos1, alice.account.address])).to.equal(
      parseUnits("60", 6),
    );
  });

  it("only the settler can report", async () => {
    const { alice, settler, token, ctf } = await setup();
    const questionId = keccak256(toHex("q2"));
    await ctf.write.prepareCondition([
      settler.account.address,
      token.address,
      questionId,
      2,
    ]);
    const conditionId = await ctf.read.getConditionId([
      settler.account.address,
      questionId,
      2,
    ]);
    await expect(
      ctf.write.reportPayouts([conditionId, 0], { account: alice.account }),
    ).to.be.rejected;
  });
});
