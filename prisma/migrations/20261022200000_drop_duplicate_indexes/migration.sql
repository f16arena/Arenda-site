-- Лишние индексы: на тех же колонках уже стоит уникальный индекс (@@unique / @unique).
--
-- Prisma создавала оба — обычный (@@index) и уникальный, — а Postgres умеет искать по
-- уникальному так же, как по обычному. Второй ничего не ускорял, только занимал место и
-- обновлялся при каждой записи. Нашёл советник панели status.commrent.kz (22.10.2026).
-- Уникальность не меняется: её держат индексы *_key, они остаются.

DROP INDEX IF EXISTS "debt_installments_plan_id_seq_idx";
DROP INDEX IF EXISTS "floors_building_id_number_idx";
DROP INDEX IF EXISTS "meter_readings_meter_id_period_idx";
DROP INDEX IF EXISTS "tenant_documents_storage_file_id_idx";
