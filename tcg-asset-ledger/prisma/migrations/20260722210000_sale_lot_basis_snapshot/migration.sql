-- Snapshot the combined cost basis at settle (so settled-lot profit can't drift),
-- and make the linked sale unique (one SALE per lot — defense against double-settle).
ALTER TABLE "SaleLot" ADD COLUMN IF NOT EXISTS "totalBasisCents" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "SaleLot_saleTransactionId_key" ON "SaleLot"("saleTransactionId");
