import type { Prisma } from "@prisma/client";

/** ResolverRequest fields safe before/after {@link prisma/migrations/20260530120000_schema_sync}. */
export const resolverRequestSelect = {
  id: true,
  subjectType: true,
  subjectId: true,
  requestedBy: true,
  suggested: true,
  reason: true,
  status: true,
  reviewedBy: true,
  approvedBy: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ResolverRequestSelect;

export type ResolverRequestRow = Prisma.ResolverRequestGetPayload<{
  select: typeof resolverRequestSelect;
}>;
