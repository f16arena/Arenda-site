-- Миграция 2026-05-27: услуги включённые в эксплуатационный сбор
-- Применять в Supabase SQL Editor. Идемпотентно.

-- utilitiesInServiceFee — JSON-массив строк типа ["ELECTRICITY","WATER"].
-- Если услуга в этом списке — она НЕ выставляется арендатору отдельно
-- (уже в эксп. сборе) и скрывается из формы «Доп. начисления».
ALTER TABLE buildings
  ADD COLUMN IF NOT EXISTS utilities_in_service_fee TEXT;
