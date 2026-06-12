-- Позиция объекта зоны (крыша/территория) в метрах внутри зоны — чтобы объект
-- стоял там, где его поставили в 3D, а не по авто-сетке. NULL = авто-раскладка.
ALTER TABLE "spaces"
  ADD COLUMN IF NOT EXISTS "pos_x" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "pos_z" DOUBLE PRECISION;
