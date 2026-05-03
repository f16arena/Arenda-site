-- Multi-building access for admins and staff.
CREATE TABLE IF NOT EXISTS "user_building_access" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "building_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_building_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_building_access_user_id_building_id_key"
  ON "user_building_access"("user_id", "building_id");

CREATE INDEX IF NOT EXISTS "user_building_access_building_id_idx"
  ON "user_building_access"("building_id");

ALTER TABLE "user_building_access"
  ADD CONSTRAINT "user_building_access_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_building_access"
  ADD CONSTRAINT "user_building_access_building_id_fkey"
  FOREIGN KEY ("building_id") REFERENCES "buildings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: existing non-tenant staff users get access to all current buildings
-- in their organization, so the release does not lock anyone out.
INSERT INTO "user_building_access" ("id", "user_id", "building_id", "created_at")
SELECT
  'uba_' || md5(u."id" || ':' || b."id"),
  u."id",
  b."id",
  CURRENT_TIMESTAMP
FROM "users" u
JOIN "buildings" b ON b."organization_id" = u."organization_id"
WHERE u."role" IN ('ADMIN', 'ACCOUNTANT', 'FACILITY_MANAGER', 'EMPLOYEE')
ON CONFLICT ("user_id", "building_id") DO NOTHING;

-- Backfill legacy one-admin-per-building assignments as explicit access too.
INSERT INTO "user_building_access" ("id", "user_id", "building_id", "created_at")
SELECT
  'uba_' || md5(b."administrator_user_id" || ':' || b."id"),
  b."administrator_user_id",
  b."id",
  CURRENT_TIMESTAMP
FROM "buildings" b
WHERE b."administrator_user_id" IS NOT NULL
ON CONFLICT ("user_id", "building_id") DO NOTHING;
