-- CreateTable
CREATE TABLE "GradingPlay" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "name" TEXT NOT NULL,
    "set" TEXT,
    "cardNumber" TEXT,
    "variant" TEXT,
    "game" TEXT,
    "notes" TEXT,
    "rawValueCents" INTEGER NOT NULL DEFAULT 0,
    "purchasePriceCents" INTEGER,
    "psa10Cents" INTEGER NOT NULL DEFAULT 0,
    "psa9Cents" INTEGER,
    "psa8Cents" INTEGER,
    "gemRatePct" INTEGER NOT NULL DEFAULT 50,
    "feeCents" INTEGER NOT NULL DEFAULT 1999,
    "shippingCents" INTEGER NOT NULL DEFAULT 300,
    "insuranceCents" INTEGER NOT NULL DEFAULT 100,
    "suppliesCents" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'LookingFor',
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "returnedGrade" TEXT,
    "certNumber" TEXT,
    "finalSalePriceCents" INTEGER,
    "returnedAt" TIMESTAMP(3),
    "gradingSubmissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradingPlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GradingPlay_status_idx" ON "GradingPlay"("status");

-- CreateIndex
CREATE INDEX "GradingPlay_priority_idx" ON "GradingPlay"("priority");

-- CreateIndex
CREATE INDEX "GradingPlay_assetId_idx" ON "GradingPlay"("assetId");

-- AddForeignKey
ALTER TABLE "GradingPlay" ADD CONSTRAINT "GradingPlay_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
