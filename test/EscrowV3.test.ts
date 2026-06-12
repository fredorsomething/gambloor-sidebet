import { expect } from "chai";
import hre from "hardhat";
import { getAddress, keccak256, parseUnits, toBytes, zeroHash } from "viem";

async function setup() {
  const [owner, proposer, acceptor, settler, outsider] =
    await hre.viem.getWalletClients();
  const platformFeeRecipient = owner.account.address;
  const token = await hre.viem.deployContract("MockERC20", []);
  const escrow = await hre.viem.deployContract("SidebetEscrowV3", [
    platformFeeRecipient,
  ]);

  const amt = parseUnits("1000", 6);
  await token.write.mint([proposer.account.address, amt]);
  await token.write.mint([acceptor.account.address, amt]);
  await token.write.mint([outsider.account.address, amt]);

  await token.write.approve([escrow.address, amt], { account: proposer.account });
  await token.write.approve([escrow.address, amt], { account: acceptor.account });
  await token.write.approve([escrow.address, amt], { account: outsider.account });

  await escrow.write.setSettler([settler.account.address, true, 200]);

  return {
    owner,
    proposer,
    acceptor,
    settler,
    outsider,
    platformFeeRecipient,
    token,
    escrow,
  };
}

const STAKE = parseUnits("100", 6);

function createArgs(settler: `0x${string}`, token: `0x${string}`) {
  return [settler, token, STAKE, STAKE, 0, 1, 2, 0n, 0n, zeroHash] as const;
}

describe("SidebetEscrowV3", () => {
  it("keeps the V2 lifecycle: create, accept, settle with fee", async () => {
    const { proposer, acceptor, settler, platformFeeRecipient, token, escrow } =
      await setup();

    await escrow.write.createBet(
      [...createArgs(settler.account.address, token.address)],
      { account: proposer.account },
    );
    await escrow.write.acceptBet([1n], { account: acceptor.account });

    const feeBefore = (await token.read.balanceOf([platformFeeRecipient])) as bigint;
    const before = (await token.read.balanceOf([proposer.account.address])) as bigint;
    await escrow.write.settleBet([1n, 0], { account: settler.account });

    const pool = STAKE * 2n;
    const fee = (pool * 200n) / 10000n;
    expect(
      ((await token.read.balanceOf([proposer.account.address])) as bigint) - before,
    ).to.equal(pool - fee);
    expect(
      ((await token.read.balanceOf([platformFeeRecipient])) as bigint) - feeBefore,
    ).to.equal(fee);
  });

  it("pulls the on-chain bet creation fee when set", async () => {
    const { proposer, settler, platformFeeRecipient, token, escrow } = await setup();
    const creationFee = parseUnits("0.05", 6);
    await escrow.write.setBetCreationFee([token.address, creationFee]);

    const feeBefore = (await token.read.balanceOf([platformFeeRecipient])) as bigint;
    const before = (await token.read.balanceOf([proposer.account.address])) as bigint;
    await escrow.write.createBet(
      [...createArgs(settler.account.address, token.address)],
      { account: proposer.account },
    );

    expect(
      before - ((await token.read.balanceOf([proposer.account.address])) as bigint),
    ).to.equal(STAKE + creationFee);
    expect(
      ((await token.read.balanceOf([platformFeeRecipient])) as bigint) - feeBefore,
    ).to.equal(creationFee);
  });

  it("enforces reserved bets: only the intended acceptor can accept", async () => {
    const { proposer, acceptor, settler, outsider, token, escrow } = await setup();

    await escrow.write.createBetFor(
      [...createArgs(settler.account.address, token.address), acceptor.account.address],
      { account: proposer.account },
    );

    await expect(
      escrow.write.acceptBet([1n], { account: outsider.account }),
    ).to.be.rejected;

    await escrow.write.acceptBet([1n], { account: acceptor.account });
    const bet = (await escrow.read.getBet([1n])) as { acceptor: string; status: number };
    expect(getAddress(bet.acceptor)).to.equal(getAddress(acceptor.account.address));
    expect(bet.status).to.equal(2); // Matched
  });

  it("settles via mutual confirmation without the settler", async () => {
    const { proposer, acceptor, settler, token, escrow } = await setup();

    await escrow.write.createBet(
      [...createArgs(settler.account.address, token.address)],
      { account: proposer.account },
    );
    await escrow.write.acceptBet([1n], { account: acceptor.account });

    // One-sided confirmation does not settle.
    await escrow.write.confirmOutcome([1n, 1], { account: proposer.account });
    let bet = (await escrow.read.getBet([1n])) as { status: number };
    expect(bet.status).to.equal(2); // still Matched

    // Disagreement does not settle either.
    await escrow.write.confirmOutcome([1n, 0], { account: acceptor.account });
    bet = (await escrow.read.getBet([1n])) as { status: number };
    expect(bet.status).to.equal(2);

    // Acceptor revises to agree with the proposer: settles to outcome 1 (acceptor's side).
    const before = (await token.read.balanceOf([acceptor.account.address])) as bigint;
    await escrow.write.confirmOutcome([1n, 1], { account: acceptor.account });
    bet = (await escrow.read.getBet([1n])) as { status: number; winningOutcome: number };
    expect(bet.status).to.equal(3); // Settled
    const pool = STAKE * 2n;
    const fee = (pool * 200n) / 10000n;
    expect(
      ((await token.read.balanceOf([acceptor.account.address])) as bigint) - before,
    ).to.equal(pool - fee);
  });

  it("rejects confirmations from non-parties", async () => {
    const { proposer, acceptor, settler, outsider, token, escrow } = await setup();
    await escrow.write.createBet(
      [...createArgs(settler.account.address, token.address)],
      { account: proposer.account },
    );
    await escrow.write.acceptBet([1n], { account: acceptor.account });
    await expect(
      escrow.write.confirmOutcome([1n, 0], { account: outsider.account }),
    ).to.be.rejected;
  });

  it("pauses creation but never settlement or refunds", async () => {
    const { owner, proposer, acceptor, settler, token, escrow } = await setup();

    await escrow.write.createBet(
      [...createArgs(settler.account.address, token.address)],
      { account: proposer.account },
    );
    await escrow.write.acceptBet([1n], { account: acceptor.account });

    await escrow.write.setPaused([true], { account: owner.account });

    await expect(
      escrow.write.createBet(
        [...createArgs(settler.account.address, token.address)],
        { account: proposer.account },
      ),
    ).to.be.rejected;

    // Settlement still works while paused.
    await escrow.write.settleBet([1n, 0], { account: settler.account });
    const bet = (await escrow.read.getBet([1n])) as { status: number };
    expect(bet.status).to.equal(3);
  });

  it("registers markets with the creation fee and records outcomes", async () => {
    const { proposer, settler, outsider, platformFeeRecipient, token, escrow } =
      await setup();
    const marketFee = parseUnits("1", 6);
    await escrow.write.setMarketCreationFee([token.address, marketFee]);

    const conditionId = keccak256(toBytes("market-1"));
    const termsHash = keccak256(toBytes("terms"));

    const feeBefore = (await token.read.balanceOf([platformFeeRecipient])) as bigint;
    await escrow.write.registerMarket(
      [conditionId, settler.account.address, 2, termsHash, token.address],
      { account: proposer.account },
    );
    expect(
      ((await token.read.balanceOf([platformFeeRecipient])) as bigint) - feeBefore,
    ).to.equal(marketFee);

    const m = (await escrow.read.getMarket([conditionId])) as {
      creator: string;
      settler: string;
      numOutcomes: number;
      resolved: boolean;
    };
    expect(getAddress(m.creator)).to.equal(getAddress(proposer.account.address));
    expect(m.numOutcomes).to.equal(2);

    // Duplicate registration rejected.
    await expect(
      escrow.write.registerMarket(
        [conditionId, settler.account.address, 2, termsHash, token.address],
        { account: outsider.account },
      ),
    ).to.be.rejected;

    // Only settler/owner can record the outcome.
    await expect(
      escrow.write.recordMarketOutcome([conditionId, 1], { account: outsider.account }),
    ).to.be.rejected;
    await escrow.write.recordMarketOutcome([conditionId, 1], {
      account: settler.account,
    });
    const resolved = (await escrow.read.getMarket([conditionId])) as {
      resolved: boolean;
      winningOutcome: number;
    };
    expect(resolved.resolved).to.equal(true);
    expect(resolved.winningOutcome).to.equal(1);
  });

  it("rejects an unapproved settler for markets", async () => {
    const { proposer, outsider, token, escrow } = await setup();
    await expect(
      escrow.write.registerMarket(
        [keccak256(toBytes("m")), outsider.account.address, 2, zeroHash, token.address],
        { account: proposer.account },
      ),
    ).to.be.rejected;
  });
});
