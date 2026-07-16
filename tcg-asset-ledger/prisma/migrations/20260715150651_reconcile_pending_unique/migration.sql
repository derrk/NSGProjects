-- One pending catch-up task per asset, enforced by the database (the
-- application-level findFirst-then-create is not atomic under concurrency).
CREATE UNIQUE INDEX "ReconcileTask_assetId_pending_key"
  ON "ReconcileTask"("assetId")
  WHERE "status" = 'pending';
