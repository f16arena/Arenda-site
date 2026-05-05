ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "vat_rate" DOUBLE PRECISION NOT NULL DEFAULT 16;

ALTER TABLE "organizations"
  ALTER COLUMN "vat_rate" SET DEFAULT 16;

UPDATE "tenants"
SET "vat_rate" = 16
WHERE "vat_rate" IS NULL OR "vat_rate" NOT IN (0, 5, 10, 16);

UPDATE "organizations"
SET "vat_rate" = 16
WHERE "vat_rate" IS NULL OR "vat_rate" NOT IN (0, 5, 10, 16) OR "vat_rate" = 12;

ALTER TABLE "tenants"
  DROP CONSTRAINT IF EXISTS "tenants_vat_rate_allowed";

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_vat_rate_allowed"
  CHECK ("vat_rate" IN (0, 5, 10, 16));

ALTER TABLE "organizations"
  DROP CONSTRAINT IF EXISTS "organizations_vat_rate_allowed";

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_vat_rate_allowed"
  CHECK ("vat_rate" IN (0, 5, 10, 16));
