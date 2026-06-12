-- Строительный редактор: предмет привязан к уровню (земля/крыша/конкретный этаж)
-- и имеет масштаб. level: "ground" | "roof" | <floorId>. scale — множитель размера.
ALTER TABLE "building_decor"
  ADD COLUMN IF NOT EXISTS "level" TEXT NOT NULL DEFAULT 'ground',
  ADD COLUMN IF NOT EXISTS "scale" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- Старые элементы с on_roof=true переносим на уровень крыши.
UPDATE "building_decor" SET "level" = 'roof' WHERE "on_roof" = true AND "level" = 'ground';
