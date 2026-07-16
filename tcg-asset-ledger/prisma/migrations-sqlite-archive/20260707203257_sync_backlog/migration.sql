-- CreateTable
CREATE TABLE "SyncTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "transactionId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "SyncTask_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SyncTask_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Asset" ("assetType", "cardNumber", "collectrDateAdded", "condition", "costBasisCents", "createdAt", "game", "grade", "id", "ledgerTouched", "location", "marketPriceAsOf", "marketValueCents", "name", "naturalKey", "notes", "portfolio", "priceOverrideCents", "quantity", "rarity", "set", "source", "status", "updatedAt", "variant", "watchlist") SELECT "assetType", "cardNumber", "collectrDateAdded", "condition", "costBasisCents", "createdAt", "game", "grade", "id", "ledgerTouched", "location", "marketPriceAsOf", "marketValueCents", "name", "naturalKey", "notes", "portfolio", "priceOverrideCents", "quantity", "rarity", "set", "source", "status", "updatedAt", "variant", "watchlist" FROM "Asset";
DROP TABLE "Asset";
ALTER TABLE "new_Asset" RENAME TO "Asset";
CREATE UNIQUE INDEX "Asset_naturalKey_key" ON "Asset"("naturalKey");
CREATE INDEX "Asset_game_idx" ON "Asset"("game");
CREATE INDEX "Asset_status_idx" ON "Asset"("status");
CREATE INDEX "Asset_set_idx" ON "Asset"("set");
CREATE INDEX "Asset_inCollectr_idx" ON "Asset"("inCollectr");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SyncTask_status_idx" ON "SyncTask"("status");

-- CreateIndex
CREATE INDEX "SyncTask_assetId_idx" ON "SyncTask"("assetId");
