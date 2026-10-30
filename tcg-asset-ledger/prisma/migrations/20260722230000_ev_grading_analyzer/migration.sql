-- EV grading analyzer: cards + price/gem snapshots + config.
CREATE TABLE IF NOT EXISTS "GradeCard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "game" TEXT NOT NULL DEFAULT 'One Piece',
    "set" TEXT,
    "cardNumber" TEXT,
    "language" TEXT NOT NULL DEFAULT 'EN',
    "rarity" TEXT,
    "notes" TEXT,
    "targetRoiPct" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GradeCard_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "gradeCardId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawCents" INTEGER NOT NULL,
    "psa10Cents" INTEGER NOT NULL,
    "psa9Cents" INTEGER,
    "psa8Cents" INTEGER,
    "sales30d" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PriceSnapshot_gradeCardId_fkey" FOREIGN KEY ("gradeCardId") REFERENCES "GradeCard"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "GemSnapshot" (
    "id" TEXT NOT NULL,
    "gradeCardId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pop10" INTEGER NOT NULL,
    "popTotal" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GemSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GemSnapshot_gradeCardId_fkey" FOREIGN KEY ("gradeCardId") REFERENCES "GradeCard"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "GradingConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "values" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GradingConfig_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GradeCard_game_idx" ON "GradeCard"("game");
CREATE INDEX IF NOT EXISTS "PriceSnapshot_gradeCardId_idx" ON "PriceSnapshot"("gradeCardId");
CREATE INDEX IF NOT EXISTS "GemSnapshot_gradeCardId_idx" ON "GemSnapshot"("gradeCardId");
