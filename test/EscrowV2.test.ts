import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseUnits, zeroHash } from "viem";

async function setup() {
  const [owner, proposer, acceptor, settler] = await hre.viem.getWalletClients();
  const platformFeeRecipient = owner.account.address;
  const token = await hre.viem.deployContract("MockERC20", []);
  const escrow = await hre.viem.deployContract("SidebetEscrowV2", [
    platformFeeRecipient,
  ]);

  // Fund proposer + acceptor.
  const amt = parseUnits("1000", 6);
  await token.write.mint([proposer.account.address, amt]);
  await token.write.mint([acceptor.account.address, amt]);

  // Approve escrow.
  await token.write.approve([escrow.address, amt], { account: proposer.account });
  await token.write.approve([escrow.address, amt], { account: acceptor.account });

  // Approve the settler at 2%.
  await escrow.write.setSettler([settler.account.address, true, 200]);

  return { owner, proposer, acceptor, settler, platformFeeRecipient, token, escrow };
}

describe("SidebetEscrowV2", () => {
  it("rejects an unapproved settler and self-settle", async () => {
    const { proposer, escrow, token } = await setup();
    await expect(
      escrow.write.createBet(
        [
          proposer.account.address, // not approved + self
          token.address,
          parseUnits("100", 6),
          parseUnits("100", 6),
          0,
          1,
          2,
          0n,
          0n,
          zeroHash,
        ],
        { account: proposer.account },
      ),
    ).to.be.rejected;
  });

  it("pays the proposer less the fee and routes fee to platform recipient", async () => {
    const { owner, proposer, acceptor, settler, platformFeeRecipient, token, escrow } =
      await setup();
    const pStake = parseUnits("100", 6);
    const aStake = parseUnits("300", 6);

    await escrow.write.createBet(
      [settler.account.address, token.address, pStake, aStake, 0, 1, 2, 0n, 0n, zeroHash],
      { account: proposer.account },
    );
    await escrow.write.acceptBet([1n], { account: acceptor.account });

    const feeBefore = (await token.read.balanceOf([platformFeeRecipient])) as bigint;
    const before = (await token.read.balanceOf([proposer.account.address])) as bigint;
    await escrow.write.settleBet([1n, 0], { account: settler.account }); // proposer outcome wins

    const pool = pStake + aStake;
    const fee = (pool * 200n) / 10000n;
    const payout = pool - fee;
    const after = (await token.read.balanceOf([proposer.account.address])) as bigint;
    expect(after - before).to.equal(payout);

    const feeAfter = (await token.read.balanceOf([platformFeeRecipient])) as bigint;
    expect(feeAfter - feeBefore).to.equal(fee);

    const settlerBal = await token.read.balanceOf([settler.account.address]);
    expect(settlerBal).to.equal(0n);

    expect(getAddress(platformFeeRecipient)).to.equal(getAddress(owner.account.address));
  });

  it("refunds both when the winning outcome is unbacked (3 outcomes)", async () => {
    const { proposer, acceptor, settler, token, escrow } = await setup();
    const pStake = parseUnits("100", 6);
    const aStake = parseUnits("100", 6);

    await escrow.write.createBet(
      [settler.account.address, token.address, pStake, aStake, 0, 1, 3, 0n, 0n, zeroHash],
      { account: proposer.account },
    );
    await escrow.write.acceptBet([1n], { account: acceptor.account });

    const pBefore = (await token.read.balanceOf([proposer.account.address])) as bigint;
    const aBefore = (await token.read.balanceOf([acceptor.account.address])) as bigint;
    await escrow.write.settleBet([1n, 2], { account: settler.account }); // outcome 2 unbacked

    expect(
      ((await token.read.balanceOf([proposer.account.address])) as bigint) - pBefore,
    ).to.equal(pStake);
    expect(
      ((await token.read.balanceOf([acceptor.account.address])) as bigint) - aBefore,
    ).to.equal(aStake);
    // No fee taken.
    expect(await token.read.balanceOf([settler.account.address])).to.equal(0n);
  });

  it("lets anyone expire an open bet after acceptDeadline", async () => {
    const { owner, proposer, settler, token, escrow } = await setup();
    const publicClient = await hre.viem.getPublicClient();
    const pStake = parseUnits("100", 6);
    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 60n;
    const beforeCreate = await token.read.balanceOf([proposer.account.address]);

    await escrow.write.createBet(
      [
        settler.account.address,
        token.address,
        pStake,
        pStake,
        0,
        1,
        2,
        deadline,
        0n,
        zeroHash,
      ],
      { account: proposer.account },
    );

    await hre.network.provider.send("evm_increaseTime", [61]);
    await hre.network.provider.send("evm_mine", []);

    await escrow.write.expireOpenBet([1n], { account: owner.account });
    expect(await token.read.balanceOf([proposer.account.address])).to.equal(
      beforeCreate,
    );
  });

  it("lets the proposer cancel an open bet", async () => {
    const { proposer, settler, token, escrow } = await setup();
    const pStake = parseUnits("100", 6);
    const beforeCreate = await token.read.balanceOf([proposer.account.address]);
    await escrow.write.createBet(
      [settler.account.address, token.address, pStake, pStake, 0, 1, 2, 0n, 0n, zeroHash],
      { account: proposer.account },
    );
    await escrow.write.cancelBet([1n], { account: proposer.account });
    expect(await token.read.balanceOf([proposer.account.address])).to.equal(
      beforeCreate,
    );
  });

  it("lets the owner update the platform fee recipient", async () => {
    const { owner, proposer, acceptor, settler, token, escrow } = await setup();
    const newRecipient = acceptor.account.address;
    await escrow.write.setPlatformFeeRecipient([newRecipient], {
      account: owner.account,
    });
    expect(await escrow.read.platformFeeRecipient()).to.equal(getAddress(newRecipient));

    const pStake = parseUnits("50", 6);
    await escrow.write.createBet(
      [settler.account.address, token.address, pStake, pStake, 0, 1, 2, 0n, 0n, zeroHash],
      { account: proposer.account },
    );
    await escrow.write.acceptBet([1n], { account: acceptor.account });

    const before = (await token.read.balanceOf([newRecipient])) as bigint;
    await escrow.write.settleBet([1n, 0], { account: settler.account });
    const fee = (pStake * 2n * 200n) / 10000n;
    const after = (await token.read.balanceOf([newRecipient])) as bigint;
    expect(after - before).to.equal(fee);
  });
});
