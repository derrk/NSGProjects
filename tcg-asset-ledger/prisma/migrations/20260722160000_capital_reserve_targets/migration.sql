-- Capital reserve targets for buying-power alerts.
ALTER TABLE "AppState" ADD COLUMN IF NOT EXISTS "minCashReserveCents" INTEGER;
ALTER TABLE "AppState" ADD COLUMN IF NOT EXISTS "buyingPowerTargetCents" INTEGER;
