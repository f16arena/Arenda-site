-- Внутренние заметки по арендатору (видны только админке) и индексация аренды:
-- ежегодное повышение ставки на indexation_pct % в дату next_indexation_at
-- (cron check-deadlines). Аудит 2026-06-10, п.14 и п.20.
ALTER TABLE "tenants" ADD COLUMN "internal_notes" TEXT;
ALTER TABLE "tenants" ADD COLUMN "indexation_pct" DOUBLE PRECISION;
ALTER TABLE "tenants" ADD COLUMN "next_indexation_at" TIMESTAMP(3);
