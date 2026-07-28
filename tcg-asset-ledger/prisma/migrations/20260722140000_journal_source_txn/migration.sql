-- Idempotency key for the inventory→journal mirror: one journal entry per source transaction.
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "sourceTransactionId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_sourceTransactionId_key" ON "JournalEntry"("sourceTransactionId");
