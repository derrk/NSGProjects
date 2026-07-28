-- Switch the grading-play population signal from a 3-value scarcity enum to an
-- actual PSA 10 population count (classified into tiers in app code). The old
-- "scarcity" column was added earlier this session and never populated, so
-- dropping it loses nothing.
ALTER TABLE "GradingPlay" ADD COLUMN IF NOT EXISTS "psa10Pop" INTEGER;
ALTER TABLE "GradingPlay" DROP COLUMN IF EXISTS "scarcity";
