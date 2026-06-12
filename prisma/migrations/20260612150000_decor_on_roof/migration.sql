-- Декор может стоять на крыше (оборудование: HVAC, вентиляция, бак, зелень),
-- а не только на земле. on_roof=true → 3D ставит элемент на уровень кровли.
ALTER TABLE "building_decor"
  ADD COLUMN IF NOT EXISTS "on_roof" BOOLEAN NOT NULL DEFAULT false;
