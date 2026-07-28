-- Rename the "supplies" grading-cost line to a pre-grading fee, and set the
-- real per-card defaults: $80 fee + $3 ship + $2 insurance + $7 pre-grading.
-- Rename is guarded so a partial/re-run can't error (column may already be renamed).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'GradingPlay' AND column_name = 'suppliesCents'
  ) THEN
    ALTER TABLE "GradingPlay" RENAME COLUMN "suppliesCents" TO "preGradingFeeCents";
  END IF;
END $$;

ALTER TABLE "GradingPlay" ALTER COLUMN "feeCents" SET DEFAULT 8000;
ALTER TABLE "GradingPlay" ALTER COLUMN "shippingCents" SET DEFAULT 300;
ALTER TABLE "GradingPlay" ALTER COLUMN "insuranceCents" SET DEFAULT 200;
ALTER TABLE "GradingPlay" ALTER COLUMN "preGradingFeeCents" SET DEFAULT 700;
