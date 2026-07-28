-- BGS comps on GradingPlay.
ALTER TABLE "GradingPlay" ADD COLUMN IF NOT EXISTS "bgs10Cents" INTEGER;
ALTER TABLE "GradingPlay" ADD COLUMN IF NOT EXISTS "bgsBlackLabelCents" INTEGER;
