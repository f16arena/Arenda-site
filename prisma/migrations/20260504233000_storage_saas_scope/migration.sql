ALTER TABLE "stored_files"
  ADD COLUMN IF NOT EXISTS "building_id" TEXT,
  ADD COLUMN IF NOT EXISTS "tenant_id" TEXT,
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'ADMIN_ONLY';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stored_files_building_id_fkey'
  ) THEN
    ALTER TABLE "stored_files"
      ADD CONSTRAINT "stored_files_building_id_fkey"
      FOREIGN KEY ("building_id") REFERENCES "buildings"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stored_files_tenant_id_fkey'
  ) THEN
    ALTER TABLE "stored_files"
      ADD CONSTRAINT "stored_files_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "stored_files_org_building_category_created_at_idx"
  ON "stored_files"("organization_id", "building_id", "category", "created_at");

CREATE INDEX IF NOT EXISTS "stored_files_org_tenant_category_created_at_idx"
  ON "stored_files"("organization_id", "tenant_id", "category", "created_at");

CREATE INDEX IF NOT EXISTS "stored_files_org_category_created_at_idx"
  ON "stored_files"("organization_id", "category", "created_at");

UPDATE "stored_files" sf
SET
  "tenant_id" = t."id",
  "building_id" = COALESCE(
    (
      SELECT f."building_id"
      FROM "spaces" s
      JOIN "floors" f ON f."id" = s."floor_id"
      WHERE s."id" = t."space_id"
      LIMIT 1
    ),
    (
      SELECT f."building_id"
      FROM "tenant_spaces" ts
      JOIN "spaces" s ON s."id" = ts."space_id"
      JOIN "floors" f ON f."id" = s."floor_id"
      WHERE ts."tenant_id" = t."id"
      ORDER BY ts."is_primary" DESC, ts."created_at" ASC
      LIMIT 1
    ),
    (
      SELECT f."building_id"
      FROM "floors" f
      WHERE f."full_floor_tenant_id" = t."id"
      ORDER BY f."number" ASC
      LIMIT 1
    )
  ),
  "category" = 'TENANT_DOCUMENT',
  "visibility" = 'TENANT_VISIBLE'
FROM "tenant_documents" td
JOIN "tenants" t ON t."id" = td."tenant_id"
WHERE sf."id" = td."storage_file_id";

UPDATE "stored_files" sf
SET
  "tenant_id" = t."id",
  "building_id" = COALESCE(
    (
      SELECT f."building_id"
      FROM "spaces" s
      JOIN "floors" f ON f."id" = s."floor_id"
      WHERE s."id" = t."space_id"
      LIMIT 1
    ),
    (
      SELECT f."building_id"
      FROM "tenant_spaces" ts
      JOIN "spaces" s ON s."id" = ts."space_id"
      JOIN "floors" f ON f."id" = s."floor_id"
      WHERE ts."tenant_id" = t."id"
      ORDER BY ts."is_primary" DESC, ts."created_at" ASC
      LIMIT 1
    ),
    (
      SELECT f."building_id"
      FROM "floors" f
      WHERE f."full_floor_tenant_id" = t."id"
      ORDER BY f."number" ASC
      LIMIT 1
    )
  ),
  "category" = 'PAYMENT_RECEIPT',
  "visibility" = 'TENANT_VISIBLE'
FROM "payment_reports" pr
JOIN "tenants" t ON t."id" = pr."tenant_id"
WHERE sf."id" = pr."receipt_file_id";
