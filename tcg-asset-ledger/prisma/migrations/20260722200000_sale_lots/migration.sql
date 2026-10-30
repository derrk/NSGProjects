-- Lot sales: stage a batch of cards, settle as one SALE with a lump gross + net payout.
CREATE TABLE IF NOT EXISTS "SaleLot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'Whatnot',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "grossCents" INTEGER,
    "netCents" INTEGER,
    "soldAt" TIMESTAMP(3),
    "saleTransactionId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SaleLot_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "SaleLotItem" (
    "id" TEXT NOT NULL,
    "saleLotId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "SaleLotItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SaleLotItem_saleLotId_fkey" FOREIGN KEY ("saleLotId") REFERENCES "SaleLot"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SaleLotItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SaleLot_status_idx" ON "SaleLot"("status");
CREATE INDEX IF NOT EXISTS "SaleLotItem_saleLotId_idx" ON "SaleLotItem"("saleLotId");
CREATE INDEX IF NOT EXISTS "SaleLotItem_assetId_idx" ON "SaleLotItem"("assetId");
