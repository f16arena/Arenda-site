-- Черновики объявлений для внешних площадок (krisha и т.п.). Полуавтомат.
CREATE TABLE IF NOT EXISTS "listing_drafts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "building_id" TEXT,
  "space_id" TEXT NOT NULL,
  "target" TEXT NOT NULL DEFAULT 'krisha',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price_monthly" INTEGER,
  "price_per_sqm" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "external_url" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "listing_drafts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "listing_drafts_organization_id_status_idx" ON "listing_drafts" ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "listing_drafts_space_id_idx" ON "listing_drafts" ("space_id");
