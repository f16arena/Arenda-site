-- Декор территории/крыши (деревья, кусты, фонари, скамейки) — не аренда, чистая
-- сцена для 3D. Позиция x,z в метрах (мировые координаты, центр здания = 0,0).
CREATE TABLE IF NOT EXISTS "building_decor" (
  "id"          TEXT PRIMARY KEY,
  "building_id" TEXT NOT NULL,
  "kind"        TEXT NOT NULL,
  "x"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "z"           DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rot"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "building_decor_building_id_idx" ON "building_decor" ("building_id");

DO $$ BEGIN
  ALTER TABLE "building_decor"
    ADD CONSTRAINT "building_decor_building_id_fkey"
    FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
