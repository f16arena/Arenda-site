-- Поворот объекта зоны (крыша/территория) в градусах вокруг вертикальной оси.
-- NULL = 0°. Используется 3D-видом для ориентации модели (антенна, машина, щит).
ALTER TABLE "spaces"
  ADD COLUMN IF NOT EXISTS "pos_rot" DOUBLE PRECISION;
