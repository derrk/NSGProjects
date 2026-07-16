-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GradingSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT 'PSA',
    "serviceLevel" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnAt" DATETIME,
    "returnedAt" DATETIME,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GradingSubmission_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GradingSubmission" ("assetId", "basisBeforeCents", "certNumber", "certUrl", "company", "createdAt", "expectedReturnAt", "feeCents", "grade", "id", "insuranceCents", "marketValueAtReturnCents", "marketValueAtSubmitCents", "notes", "returnTransactionId", "returnedAt", "serviceLevel", "shippingCents", "status", "submitTransactionId", "submittedAt") SELECT "assetId", "basisBeforeCents", "certNumber", "certUrl", "company", "createdAt", "expectedReturnAt", "feeCents", "grade", "id", "insuranceCents", "marketValueAtReturnCents", "marketValueAtSubmitCents", "notes", "returnTransactionId", "returnedAt", "serviceLevel", "shippingCents", "status", "submitTransactionId", "submittedAt" FROM "GradingSubmission";
DROP TABLE "GradingSubmission";
ALTER TABLE "new_GradingSubmission" RENAME TO "GradingSubmission";
CREATE INDEX "GradingSubmission_assetId_idx" ON "GradingSubmission"("assetId");
CREATE INDEX "GradingSubmission_status_idx" ON "GradingSubmission"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
