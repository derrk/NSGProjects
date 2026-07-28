-- PSA 10 population scarcity (Low | Medium | High | null) for the buy-vs-grade
-- long-term-hold signal. Nullable, no default — existing plays stay "unknown".
ALTER TABLE "GradingPlay" ADD COLUMN IF NOT EXISTS "scarcity" TEXT;
