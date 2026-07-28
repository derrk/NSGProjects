-- Personal-collection flag: excluded from business metrics.
ALTER TABLE "Asset" ADD COLUMN "isPersonal" BOOLEAN NOT NULL DEFAULT false;
