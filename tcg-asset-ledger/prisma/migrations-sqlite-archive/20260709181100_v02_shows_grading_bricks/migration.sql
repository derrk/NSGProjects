-- CreateTable
CREATE TABLE "Show" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "venue" TEXT,
    "city" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Upcoming',
    "tableFeeCents" INTEGER NOT NULL DEFAULT 0,
    "hotelCents" INTEGER NOT NULL DEFAULT 0,
    "travelCents" INTEGER NOT NULL DEFAULT 0,
    "foodCents" INTEGER NOT NULL DEFAULT 0,
    "otherCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "enteredAt" DATETIME,
    "endedAt" DATETIME,
    "buyingCashCents" INTEGER,
    "personalCashCents" INTEGER,
    "endingCashCents" INTEGER,
    "snapshotValueCents" INTEGER,
    "snapshotBasisCents" INTEGER,
    "snapshotAssetCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GradingSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT 'PSA',
    "serviceLevel" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnAt" DATETIME,
    "returnedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Out',
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GradingSubmission_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "activeShowId" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "acquiredAt" DATETIME,
    "gradingCompany" TEXT,
    "certNumber" TEXT,
    "source" TEXT,
    "location" TEXT,
    "portfolio" TEXT,
    "notes" TEXT,
    "naturalKey" TEXT NOT NULL,
    "collectrDateAdded" DATETIME,
    "marketPriceAsOf" DATETIME,
    "watchlist" BOOLEAN NOT NULL DEFAULT false,
    "ledgerTouched" BOOLEAN NOT NULL DEFAULT false,
    "inCollectr" BOOLEAN NOT NULL DEFAULT false,
    "collectrCostCents" INTEGER,
    "collectrQuantity" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Asset" ("assetType", "cardNumber", "collectrCostCents", "collectrDateAdded", "collectrQuantity", "condition", "costBasisCents", "createdAt", "game", "grade", "id", "inCollectr", "ledgerTouched", "location", "marketPriceAsOf", "marketValueCents", "name", "naturalKey", "notes", "portfolio", "priceOverrideCents", "quantity", "rarity", "set", "source", "status", "updatedAt", "variant", "watchlist") SELECT "assetType", "cardNumber", "collectrCostCents", "collectrDateAdded", "collectrQuantity", "condition", "costBasisCents", "createdAt", "game", "grade", "id", "inCollectr", "ledgerTouched", "location", "marketPriceAsOf", "marketValueCents", "name", "naturalKey", "notes", "portfolio", "priceOverrideCents", "quantity", "rarity", "set", "source", "status", "updatedAt", "variant", "watchlist" FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE UNIQUE INDEX "Asset_naturalKey_key" ON "Asset"("naturalKey");
CREATE INDEX "Asset_game_idx" ON "Asset"("game");
CREATE INDEX "Asset_status_idx" ON "Asset"("status");
CREATE INDEX "Asset_set_idx" ON "Asset"("set");
CREATE INDEX "Asset_inCollectr_idx" ON "Asset"("inCollectr");
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "counterparty" TEXT,
    "cashDeltaCents" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "showId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("cashDeltaCents", "counterparty", "createdAt", "date", "id", "notes", "type") SELECT "cashDeltaCents", "counterparty", "createdAt", "date", "id", "notes", "type" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
CREATE INDEX "Transaction_showId_idx" ON "Transaction"("showId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Show_status_idx" ON "Show"("status");

-- CreateIndex
CREATE INDEX "Show_startDate_idx" ON "Show"("startDate");

-- CreateIndex
CREATE INDEX "GradingSubmission_assetId_idx" ON "GradingSubmission"("assetId");

-- CreateIndex
CREATE INDEX "GradingSubmission_status_idx" ON "GradingSubmission"("status");
