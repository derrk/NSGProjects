-- Additive: new Customer table + optional link from Transaction. No existing
-- rows are touched — historical transactions keep counterparty as free text,
-- and a live-show sale can still be logged without picking a customer.

CREATE TABLE IF NOT EXISTS "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Customer_name_idx" ON "Customer"("name");

ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "customerId" TEXT;

CREATE INDEX IF NOT EXISTS "Transaction_customerId_idx" ON "Transaction"("customerId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_customerId_fkey') THEN
    ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
