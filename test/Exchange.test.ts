import { expect } from "chai";
import hre from "hardhat";
import { keccak256, parseUnits, toHex } from "viem";

const ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "side", type: "uint8" },
  ],
} as const;

async function setup() {
  const [deployer, settler, maker, taker] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const token = await hre.viem.deployContract("MockERC20", []);
  const ctf = await hre.viem.deployContract("ConditionalTokens", []);
  const exchange = await hre.viem.deployContract("CTFExchange", [
    ctf.address,
    token.address,
  ]);

  // Prepare a 2-outcome condition + mint maker a full set.
  const questionId = keccak256(toHex("exq"));
  await ctf.write.prepareCondition([settler.account.address, token.address, questionId, 2]);
  const conditionId = await ctf.read.getConditionId([
    settler.account.address,
    questionId,
    2,
  ]);
  const pos0 = await ctf.read.getPositionId([conditionId, token.address, 0]);

  await token.write.mint([maker.account.address, parseUnits("1000", 6)]);
  await token.write.mint([taker.account.address, parseUnits("1000", 6)]);
  await token.write.approve([ctf.address, parseUnits("1000", 6)], {
    account: maker.account,
  });
  await ctf.write.splitPosition([conditionId, parseUnits("100", 6)], {
    account: maker.account,
  });

  return { deployer, settler, maker, taker, token, ctf, exchange, chainId, pos0 };
}

describe("CTFExchange", () => {
  it("fills a SELL order: maker gives shares, taker gives collateral", async () => {
    const { maker, taker, token, ctf, exchange, chainId, pos0 } = await setup();

    // Maker approves exchange for shares; taker approves exchange for collateral.
    await ctf.write.setApprovalForAll([exchange.address, true], {
      account: maker.account,
    });
    await token.write.approve([exchange.address, parseUnits("1000", 6)], {
      account: taker.account,
    });

    const shares = parseUnits("100", 6); // makerAmount
    const collateral = parseUnits("60", 6); // takerAmount → price 0.6
    const order = {
      salt: 1n,
      maker: maker.account.address,
      tokenId: pos0,
      makerAmount: shares,
      takerAmount: collateral,
      expiration: 0n,
      side: 1, // SELL
    };

    const signature = await maker.signTypedData({
      domain: {
        name: "CTFExchange",
        version: "1",
        chainId,
        verifyingContract: exchange.address,
      },
      types: ORDER_TYPES,
      primaryType: "Order",
      message: order,
    });

    const makerBefore = await token.read.balanceOf([maker.account.address]);
    await exchange.write.fillOrder([order, signature, collateral], {
      account: taker.account,
    });

    // Taker now holds the shares.
    expect(await ctf.read.balanceOf([pos0, taker.account.address])).to.equal(shares);
    // Maker received the collateral.
    expect(
      (await token.read.balanceOf([maker.account.address])) - makerBefore,
    ).to.equal(collateral);
  });

  it("rejects a tampered signature and supports cancellation", async () => {
    const { maker, taker, token, ctf, exchange, chainId, pos0 } = await setup();
    await ctf.write.setApprovalForAll([exchange.address, true], {
      account: maker.account,
    });
    await token.write.approve([exchange.address, parseUnits("1000", 6)], {
      account: taker.account,
    });

    const order = {
      salt: 2n,
      maker: maker.account.address,
      tokenId: pos0,
      makerAmount: parseUnits("100", 6),
      takerAmount: parseUnits("60", 6),
      expiration: 0n,
      side: 1,
    };
    const signature = await maker.signTypedData({
      domain: {
        name: "CTFExchange",
        version: "1",
        chainId,
        verifyingContract: exchange.address,
      },
      types: ORDER_TYPES,
      primaryType: "Order",
      message: order,
    });

    // Cancel, then a fill must revert.
    await exchange.write.cancelOrder([order], { account: maker.account });
    await expect(
      exchange.write.fillOrder([order, signature, parseUnits("60", 6)], {
        account: taker.account,
      }),
    ).to.be.rejected;
  });
});
