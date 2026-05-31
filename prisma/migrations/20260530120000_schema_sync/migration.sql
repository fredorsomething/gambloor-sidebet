-- Sync production Postgres with Prisma schema (idempotent).
-- Fixes 500s from missing Market.customSettler and ResolverRequest.approvedBy.

ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS "customSettler" TEXT;

ALTER TABLE "ResolverRequest" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;
