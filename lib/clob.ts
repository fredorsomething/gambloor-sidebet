import { encodePacked, keccak256, type Address, type Hex } from "viem";

/**
 * Deterministic market id derivation.
 *
 * Markets are fully off-chain (custodial engine + ledger), but we still derive
 * stable, collision-resistant identifiers the same way the old on-chain CTF did
 * so existing rows and image keys keep resolving. These are pure hashes — no
 * chain interaction, no EIP-712, no settlement contract.
 */

/** questionId from the off-chain terms hash + nonce, so it's deterministic + unique. */
export function computeQuestionId(termsHash: Hex, nonce: string): Hex {
  return keccak256(encodePacked(["bytes32", "string"], [termsHash, nonce]));
}

/** conditionId = keccak256(settler, questionId, outcomeSlotCount). */
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

/** positionId = uint256(keccak256(collateral, conditionId, outcomeIndex)). */
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
