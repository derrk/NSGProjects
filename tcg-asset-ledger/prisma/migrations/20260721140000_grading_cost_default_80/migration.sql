-- Grading cost default raised to $80 all-in (folded into the fee; the itemized
-- extras default to 0). Only affects future inserts that omit these columns.
ALTER TABLE "GradingPlay" ALTER COLUMN "feeCents" SET DEFAULT 8000;
ALTER TABLE "GradingPlay" ALTER COLUMN "shippingCents" SET DEFAULT 0;
ALTER TABLE "GradingPlay" ALTER COLUMN "insuranceCents" SET DEFAULT 0;
ALTER TABLE "GradingPlay" ALTER COLUMN "suppliesCents" SET DEFAULT 0;
