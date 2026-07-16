-- CreateTable
CREATE TABLE "ReconcileTask" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "appQty" INTEGER NOT NULL,
    "collectrQtyBefore" INTEGER,
    "collectrQtyAfter" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolution" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReconcileTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconcileTask_status_idx" ON "ReconcileTask"("status");

-- CreateIndex
CREATE INDEX "ReconcileTask_assetId_idx" ON "ReconcileTask"("assetId");

-- AddForeignKey
ALTER TABLE "ReconcileTask" ADD CONSTRAINT "ReconcileTask_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
