import type { Prisma } from "@prisma/client";

/**
 * Explicit Market select — avoids Prisma fetching columns missing before
 * `20260530120000_schema_sync` is applied. After migrate deploy, all fields
 * including `customSettler` are available.
 */
export const marketSelect = {
  id: true,
  chainId: true,
  exchangeAddress: true,
  ctfAddress: true,
  conditionId: true,
  questionId: true,
  txHash: true,
  creator: true,
  settler: true,
  customSettler: true,
  feeBps: true,
  token: true,
  tokenSymbol: true,
  decimals: true,
  title: true,
  description: true,
  imageUrl: true,
  terms: true,
  termsHash: true,
  nonce: true,
  status: true,
  winningOutcome: true,
  estimatedEndDate: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.MarketSelect;

export const marketWithOutcomesSelect = {
  ...marketSelect,
  outcomes: { orderBy: { index: "asc" as const } },
} as const satisfies Prisma.MarketSelect;

export type MarketWithOutcomes = Prisma.MarketGetPayload<{
  select: typeof marketWithOutcomesSelect;
}>;

/** Normalize market row for API (ensures customSettler is always present). */
export function marketForApi<
  T extends MarketWithOutcomes & { customSettler?: string | null },
>(m: T, extras?: Record<string, unknown>) {
  return { ...m, customSettler: m.customSettler ?? null, ...extras };
}
