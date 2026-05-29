import {
  encodePacked,
  keccak256,
  type Address,
  type Hex,
} from "viem";

export const ORDER_SIDE = { BUY: 0, SELL: 1 } as const;
export type OrderSide = "BUY" | "SELL";

/** EIP-712 order shape (mirrors CTFExchange.Order). All numerics as bigint. */
export type ClobOrder = {
  salt: bigint;
  maker: Address;
  tokenId: bigint;
  makerAmount: bigint;
  takerAmount: bigint;
  expiration: bigint;
  side: number; // 0 = BUY, 1 = SELL
};

/** Plain string form used over the wire / in the DB. */
export type ClobOrderStrings = {
  salt: string;
  maker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  side: number;
};

export function toOrderStrings(o: ClobOrder): ClobOrderStrings {
  return {
    salt: o.salt.toString(),
    maker: o.maker,
    tokenId: o.tokenId.toString(),
    makerAmount: o.makerAmount.toString(),
    takerAmount: o.takerAmount.toString(),
    expiration: o.expiration.toString(),
    side: o.side,
  };
}

export function fromOrderStrings(o: ClobOrderStrings): ClobOrder {
  return {
    salt: BigInt(o.salt),
    maker: o.maker as Address,
    tokenId: BigInt(o.tokenId),
    makerAmount: BigInt(o.makerAmount),
    takerAmount: BigInt(o.takerAmount),
    expiration: BigInt(o.expiration),
    side: Number(o.side),
  };
}

/** EIP-712 domain for the exchange. */
export function exchangeDomain(chainId: number, verifyingContract: Address) {
  return {
    name: "CTFExchange",
    version: "1",
    chainId,
    verifyingContract,
  } as const;
}

export const ORDER_EIP712_TYPES = {
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

/**
 * conditionId = keccak256(abi.encodePacked(settler, questionId, outcomeSlotCount)).
 * Mirrors ConditionalTokens.getConditionId.
 */
export function computeConditionId(
  settler: Address,
  questionId: Hex,
  outcomeSlotCount: number,
): Hex {
  return keccak256(
    encodePacked(
      ["address", "bytes32", "uint8"],
      [settler, questionId, outcomeSlotCount],
    ),
  );
}

/**
 * positionId = uint256(keccak256(abi.encodePacked(collateral, conditionId, outcomeIndex))).
 * Mirrors ConditionalTokens.getPositionId.
 */
export function computePositionId(
  collateral: Address,
  conditionId: Hex,
  outcomeIndex: number,
): bigint {
  const h = keccak256(
    encodePacked(
      ["address", "bytes32", "uint8"],
      [collateral, conditionId, outcomeIndex],
    ),
  );
  return BigInt(h);
}

/** questionId from the off-chain terms hash + nonce, so it's deterministic + unique. */
export function computeQuestionId(termsHash: Hex, nonce: string): Hex {
  return keccak256(
    encodePacked(["bytes32", "string"], [termsHash, nonce]),
  );
}

/**
 * Price helpers. Price is expressed in collateral units per 1 whole share.
 * makerAmount/takerAmount are raw token units. A whole share == 1 unit of
 * collateral at full decimals (shares share the collateral's decimals).
 *
 * For a BUY order, maker pays `makerAmount` collateral for `takerAmount` shares,
 * so price = makerAmount / takerAmount.
 * For a SELL order, maker gives `makerAmount` shares for `takerAmount` collateral,
 * so price = takerAmount / makerAmount.
 */
export function orderPrice(o: ClobOrder): number {
  if (o.side === ORDER_SIDE.BUY) {
    if (o.takerAmount === 0n) return 0;
    return Number(o.makerAmount) / Number(o.takerAmount);
  }
  if (o.makerAmount === 0n) return 0;
  return Number(o.takerAmount) / Number(o.makerAmount);
}

/** Shares offered/sought by the order (taker-fillable share amount). */
export function orderShares(o: ClobOrder): bigint {
  return o.side === ORDER_SIDE.BUY ? o.takerAmount : o.makerAmount;
}

/** Generate a random 256-bit salt. */
export function randomSalt(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return BigInt(hex);
}
