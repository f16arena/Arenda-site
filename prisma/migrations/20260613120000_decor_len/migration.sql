-- Длина нарисованной стены (kind="wallrun"): метры. Прочие предметы — 0.
ALTER TABLE "building_decor"
  ADD COLUMN IF NOT EXISTS "len" DOUBLE PRECISION NOT NULL DEFAULT 0;
