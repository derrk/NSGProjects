-- CreateTable
CREATE TABLE "WheelSlot" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "estCostCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WheelSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WheelSpin" (
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

-- CreateIndex
CREATE INDEX "WheelSlot_active_idx" ON "WheelSlot"("active");

-- CreateIndex
CREATE INDEX "WheelSpin_slotId_idx" ON "WheelSpin"("slotId");

-- CreateIndex
CREATE INDEX "WheelSpin_showId_idx" ON "WheelSpin"("showId");

-- CreateIndex
CREATE INDEX "WheelSpin_date_idx" ON "WheelSpin"("date");

-- AddForeignKey
ALTER TABLE "WheelSpin" ADD CONSTRAINT "WheelSpin_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "WheelSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelSpin" ADD CONSTRAINT "WheelSpin_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelSpin" ADD CONSTRAINT "WheelSpin_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;
