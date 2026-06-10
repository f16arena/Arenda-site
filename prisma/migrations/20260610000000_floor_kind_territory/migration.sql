-- Тип этажа: FLOOR (обычный этаж) | TERRITORY (прилегающая территория: двор,
-- парковка, открытые площадки). Территория сдаётся теми же Space-помещениями,
-- но не учитывается в площади здания.
ALTER TABLE "floors" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'FLOOR';
