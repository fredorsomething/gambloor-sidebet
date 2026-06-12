-- Track the one-time USDC.e creation fee payment per indexed sidebet.
ALTER TABLE "Bet" ADD COLUMN IF NOT EXISTS "creationFeeTxHash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Bet_creationFeeTxHash_key"
  ON "Bet"("creationFeeTxHash")
  WHERE "creationFeeTxHash" IS NOT NULL;
