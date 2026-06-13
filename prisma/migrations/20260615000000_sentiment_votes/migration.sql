-- CreateTable
CREATE TABLE "SentimentVote" (
    "id" SERIAL NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "voter" TEXT NOT NULL,
    "outcomeIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SentimentVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SentimentVote_subjectType_subjectId_idx" ON "SentimentVote"("subjectType", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "SentimentVote_subjectType_subjectId_voter_key" ON "SentimentVote"("subjectType", "subjectId", "voter");
