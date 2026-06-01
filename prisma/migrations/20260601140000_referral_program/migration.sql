-- Referral / affiliate program: campaigns, attributions, earnings, collections.

CREATE TABLE IF NOT EXISTS "ReferralCampaign" (
  "id" SERIAL PRIMARY KEY,
  "owner" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferralCampaign_slug_key" ON "ReferralCampaign"("slug");
CREATE INDEX IF NOT EXISTS "ReferralCampaign_owner_idx" ON "ReferralCampaign"("owner");

CREATE TABLE IF NOT EXISTS "ReferralAttribution" (
  "id" SERIAL PRIMARY KEY,
  "campaignId" INTEGER NOT NULL,
  "referred" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralAttribution_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "ReferralCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferralAttribution_referred_key" ON "ReferralAttribution"("referred");
CREATE INDEX IF NOT EXISTS "ReferralAttribution_campaignId_idx" ON "ReferralAttribution"("campaignId");

CREATE TABLE IF NOT EXISTS "ReferralCollection" (
  "id" SERIAL PRIMARY KEY,
  "referrer" TEXT NOT NULL,
  "amountMicro" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Completed',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ReferralCollection_referrer_idx" ON "ReferralCollection"("referrer");

CREATE TABLE IF NOT EXISTS "ReferralEarning" (
  "id" SERIAL PRIMARY KEY,
  "campaignId" INTEGER NOT NULL,
  "referrer" TEXT NOT NULL,
  "referred" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "feeMicro" BIGINT NOT NULL,
  "shareMicro" BIGINT NOT NULL,
  "collectedAt" TIMESTAMP(3),
  "collectionId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralEarning_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "ReferralCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReferralEarning_collectionId_fkey"
    FOREIGN KEY ("collectionId") REFERENCES "ReferralCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferralEarning_source_sourceId_key" ON "ReferralEarning"("source", "sourceId");
CREATE INDEX IF NOT EXISTS "ReferralEarning_referrer_collectedAt_idx" ON "ReferralEarning"("referrer", "collectedAt");
CREATE INDEX IF NOT EXISTS "ReferralEarning_campaignId_idx" ON "ReferralEarning"("campaignId");
CREATE INDEX IF NOT EXISTS "ReferralEarning_referred_idx" ON "ReferralEarning"("referred");
