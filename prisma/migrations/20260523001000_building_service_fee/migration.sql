-- Эксплуатационный сбор (Приложение №3 к договору) — сезонные тарифы
-- на квадратный метр в месяц, настраиваемые на каждое здание.
-- Применяется как отдельная строка в ежемесячном счёте к арендной плате.

ALTER TABLE "buildings"
  ADD COLUMN IF NOT EXISTS "service_fee_winter_rate"     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "service_fee_summer_rate"     DOUBLE PRECISION,
  -- JSON-строка вида "[10,11,12,1,2,3,4]" — какие месяцы считаются зимними.
  -- NULL = использовать дефолт.
  ADD COLUMN IF NOT EXISTS "service_fee_winter_months"   TEXT,
  ADD COLUMN IF NOT EXISTS "service_fee_indexation_pct"  DOUBLE PRECISION DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "service_fee_last_indexed_at" TIMESTAMP;

-- Чтобы существующие здания не получили NULL pct (дефолт применяется
-- только к новым строкам), проставим 10 для всех существующих, у кого
-- ещё не задан.
UPDATE "buildings"
SET "service_fee_indexation_pct" = 10
WHERE "service_fee_indexation_pct" IS NULL;
