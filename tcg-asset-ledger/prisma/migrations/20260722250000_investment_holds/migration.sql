-- Investment holds: flag on Asset + a daily portfolio value snapshot.
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "isInvestment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "investmentMarkedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "InvestmentSnapshot" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "costBasisCents" INTEGER NOT NULL,
    "marketValueCents" INTEGER NOT NULL,
    "unitCount" INTEGER NOT NULL,
    "lotCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvestmentSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InvestmentSnapshot_day_key" ON "InvestmentSnapshot"("day");

CREATE INDEX IF NOT EXISTS "Asset_isInvestment_idx" ON "Asset"("isInvestment");
