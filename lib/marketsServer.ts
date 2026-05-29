import { verifyTypedData, type Address, type Hex } from "viem";

import { ORDER_EIP712_TYPES, exchangeDomain } from "@/lib/clob";

export type SignedOrderInput = {
  salt: string;
  maker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  side: number;
  signature: string;
};

/** Verifies a maker's EIP-712 order signature against the exchange domain. */
export async function verifyOrderSignature(
  order: SignedOrderInput,
  chainId: number,
  exchangeAddress: Address,
): Promise<boolean> {
  try {
    return await verifyTypedData({
      address: order.maker as Address,
      domain: exchangeDomain(chainId, exchangeAddress),
      types: ORDER_EIP712_TYPES,
      primaryType: "Order",
      message: {
        salt: BigInt(order.salt),
        maker: order.maker as Address,
        tokenId: BigInt(order.tokenId),
        makerAmount: BigInt(order.makerAmount),
        takerAmount: BigInt(order.takerAmount),
        expiration: BigInt(order.expiration),
        side: order.side,
      },
      signature: order.signature as Hex,
    });
  } catch {
    return false;
  }
}

/**
 * Decimal-string price = collateral per whole share. BUY: makerAmount/takerAmount;
 * SELL: takerAmount/makerAmount. Stored to sort the book.
 */
export function computeOrderPrice(order: {
  side: number;
  makerAmount: string;
  takerAmount: string;
}): string {
  const maker = Number(order.makerAmount);
  const taker = Number(order.takerAmount);
  if (order.side === 0) {
    // BUY
    if (taker === 0) return "0";
    return (maker / taker).toString();
  }
  if (maker === 0) return "0";
  return (taker / maker).toString();
}
