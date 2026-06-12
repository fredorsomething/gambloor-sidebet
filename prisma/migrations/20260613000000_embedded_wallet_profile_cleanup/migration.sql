-- Data migration for embedded-wallet profile consolidation is handled by
-- `npm run profiles:migrate-embedded` (scripts/migrateEmbeddedProfiles.ts),
-- which uses Privy to map each user to their embedded wallet address.
--
-- This migration is intentionally a no-op so deploy pipelines stay in sync.

SELECT 1;
