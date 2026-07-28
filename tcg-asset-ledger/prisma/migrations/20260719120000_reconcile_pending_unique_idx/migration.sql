-- One pending catch-up task per asset (re-added after history squash;
-- IF NOT EXISTS makes it a no-op on databases that already have it).
CREATE UNIQUE INDEX IF NOT EXISTS "ReconcileTask_assetId_pending_key"
  ON "ReconcileTask"("assetId")
  WHERE "status" = 'pending';
