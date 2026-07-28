-- Upcoming commitments (pre-orders, reserved fees, subscriptions) — planning overlay.
CREATE TABLE IF NOT EXISTS "Commitment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'PreOrder',
    "totalCents" INTEGER NOT NULL,
    "depositPaidCents" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Open',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Commitment_status_idx" ON "Commitment"("status");
CREATE INDEX IF NOT EXISTS "Commitment_dueDate_idx" ON "Commitment"("dueDate");
