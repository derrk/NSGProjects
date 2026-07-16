-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "assetType" TEXT NOT NULL DEFAULT 'RawCard',
    "set" TEXT,
    "cardNumber" TEXT,
    "rarity" TEXT,
    "variant" TEXT,
    "grade" TEXT,
    "condition" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "costBasisCents" INTEGER NOT NULL DEFAULT 0,
    "marketValueCents" INTEGER NOT NULL DEFAULT 0,
    "priceOverrideCents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'InStock',
    "isBrick" BOOLEAN NOT NULL DEFAULT false,
    "acquiredAt" TIMESTAMP(3),
    "gradingCompany" TEXT,
    "certNumber" TEXT,
    "source" TEXT,
    "location" TEXT,
    "portfolio" TEXT,
    "notes" TEXT,
    "naturalKey" TEXT NOT NULL,
    "collectrDateAdded" TIMESTAMP(3),
    "marketPriceAsOf" TIMESTAMP(3),
    "watchlist" BOOLEAN NOT NULL DEFAULT false,
    "ledgerTouched" BOOLEAN NOT NULL DEFAULT false,
    "inCollectr" BOOLEAN NOT NULL DEFAULT false,
    "collectrCostCents" INTEGER,
    "collectrQuantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "counterparty" TEXT,
    "cashDeltaCents" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "showId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Show" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "venue" TEXT,
    "city" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Upcoming',
    "tableFeeCents" INTEGER NOT NULL DEFAULT 0,
    "hotelCents" INTEGER NOT NULL DEFAULT 0,
    "travelCents" INTEGER NOT NULL DEFAULT 0,
    "foodCents" INTEGER NOT NULL DEFAULT 0,
    "otherCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "enteredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "buyingCashCents" INTEGER,
    "personalCashCents" INTEGER,
    "endingCashCents" INTEGER,
    "snapshotValueCents" INTEGER,
    "snapshotBasisCents" INTEGER,
    "snapshotAssetCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Show_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingSubmission" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT 'PSA',
    "serviceLevel" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Out',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "rawNaturalKey" TEXT,
    "shippingCents" INTEGER NOT NULL DEFAULT 0,
    "insuranceCents" INTEGER NOT NULL DEFAULT 0,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "grade" TEXT,
    "certNumber" TEXT,
    "certUrl" TEXT,
    "marketValueAtSubmitCents" INTEGER,
    "marketValueAtReturnCents" INTEGER,
    "basisBeforeCents" INTEGER,
    "notes" TEXT,
    "submitTransactionId" TEXT,
    "returnTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradingSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "activeShowId" TEXT,

    CONSTRAINT "AppState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncTask" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "transactionId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SyncTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'photo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionLine" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitValueCents" INTEGER NOT NULL DEFAULT 0,
    "unitBasisCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'collectr',
    "fileName" TEXT,
    "marketPriceAsOf" TIMESTAMP(3),
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_naturalKey_key" ON "Asset"("naturalKey");

-- CreateIndex
CREATE INDEX "Asset_game_idx" ON "Asset"("game");

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE INDEX "Asset_set_idx" ON "Asset"("set");

-- CreateIndex
CREATE INDEX "Asset_inCollectr_idx" ON "Asset"("inCollectr");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- CreateIndex
CREATE INDEX "Transaction_showId_idx" ON "Transaction"("showId");

-- CreateIndex
CREATE INDEX "Show_status_idx" ON "Show"("status");

-- CreateIndex
CREATE INDEX "Show_startDate_idx" ON "Show"("startDate");

-- CreateIndex
CREATE INDEX "GradingSubmission_assetId_idx" ON "GradingSubmission"("assetId");

-- CreateIndex
CREATE INDEX "GradingSubmission_status_idx" ON "GradingSubmission"("status");

-- CreateIndex
CREATE INDEX "SyncTask_status_idx" ON "SyncTask"("status");

-- CreateIndex
CREATE INDEX "SyncTask_assetId_idx" ON "SyncTask"("assetId");

-- CreateIndex
CREATE INDEX "Attachment_transactionId_idx" ON "Attachment"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionLine_transactionId_idx" ON "TransactionLine"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionLine_assetId_idx" ON "TransactionLine"("assetId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingSubmission" ADD CONSTRAINT "GradingSubmission_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncTask" ADD CONSTRAINT "SyncTask_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncTask" ADD CONSTRAINT "SyncTask_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionLine" ADD CONSTRAINT "TransactionLine_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionLine" ADD CONSTRAINT "TransactionLine_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
