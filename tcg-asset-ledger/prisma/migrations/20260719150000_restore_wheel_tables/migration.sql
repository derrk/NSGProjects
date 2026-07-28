-- Restore the wheel models to the schema. The live database ALREADY has these
-- tables (with 191 spins of data) — everything here is guarded so this is a
-- pure no-op there, while fresh databases get the full structure.

CREATE TABLE IF NOT EXISTS "WheelSlot" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "estCostCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WheelSlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WheelSpin" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slotId" TEXT NOT NULL,
    "assetId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "revenueCents" INTEGER NOT NULL DEFAULT 0,
    "prizeCostCents" INTEGER NOT NULL DEFAULT 0,
    "showId" TEXT,
    "revenueTransactionId" TEXT,
    "prizeTransactionId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WheelSpin_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WheelSlot_active_idx" ON "WheelSlot"("active");
CREATE INDEX IF NOT EXISTS "WheelSpin_slotId_idx" ON "WheelSpin"("slotId");
CREATE INDEX IF NOT EXISTS "WheelSpin_showId_idx" ON "WheelSpin"("showId");
CREATE INDEX IF NOT EXISTS "WheelSpin_date_idx" ON "WheelSpin"("date");

-- Foreign keys (ADD CONSTRAINT has no IF NOT EXISTS — guard via catalog check).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WheelSpin_slotId_fkey') THEN
    ALTER TABLE "WheelSpin" ADD CONSTRAINT "WheelSpin_slotId_fkey"
      FOREIGN KEY ("slotId") REFERENCES "WheelSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WheelSpin_assetId_fkey') THEN
    ALTER TABLE "WheelSpin" ADD CONSTRAINT "WheelSpin_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WheelSpin_showId_fkey') THEN
    ALTER TABLE "WheelSpin" ADD CONSTRAINT "WheelSpin_showId_fkey"
      FOREIGN KEY ("showId") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
