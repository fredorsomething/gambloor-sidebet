-- Prevent duplicate global-chat feed announcements when concurrent syncs
-- detect the same bet lifecycle transition.
ALTER TABLE "Bet" ADD COLUMN IF NOT EXISTS "matchedFeedAt" TIMESTAMP(3);
ALTER TABLE "Bet" ADD COLUMN IF NOT EXISTS "settledFeedAt" TIMESTAMP(3);
