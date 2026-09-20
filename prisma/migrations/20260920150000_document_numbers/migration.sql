-- Уникальность номеров и атомарная выдача номеров документов.
-- Раньше номер вычислялся как «максимум + 1» отдельным запросом: два
-- одновременных документа могли получить одинаковый номер (для ЭСФ это
-- недопустимо), а дубли ничем не запрещались.

CREATE UNIQUE INDEX IF NOT EXISTS "floors_building_id_number_key" ON "floors" ("building_id", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "spaces_floor_id_number_key" ON "spaces" ("floor_id", "number");
CREATE UNIQUE INDEX IF NOT EXISTS "meter_readings_meter_id_period_key" ON "meter_readings" ("meter_id", "period");
CREATE UNIQUE INDEX IF NOT EXISTS "debt_installments_plan_id_seq_key" ON "debt_installments" ("plan_id", "seq");

-- Номера документов уникальны в пределах организации и вида (без удалённых).
CREATE UNIQUE INDEX IF NOT EXISTS "generated_documents_org_type_number_unique"
  ON "generated_documents" ("organization_id", "document_type", "number")
  WHERE "deleted_at" IS NULL AND "number" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "document_counters" (
  "organization_id" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "next_number" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_counters_pkey" PRIMARY KEY ("organization_id", "document_type")
);

ALTER TABLE "document_counters" DROP CONSTRAINT IF EXISTS "document_counters_organization_id_fkey";
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Начальное значение счётчика: максимум из уже выданных номеров и стартового
-- номера из настроек (продолжение нумерации из 1С).
INSERT INTO "document_counters" ("organization_id", "document_type", "next_number")
SELECT o."id", t."document_type",
       GREATEST(
         COALESCE((SELECT MAX(NULLIF(regexp_replace(g."number", '\D', '', 'g'), '')::int)
                   FROM "generated_documents" g
                   WHERE g."organization_id" = o."id" AND g."document_type" = t."document_type"
                     AND g."deleted_at" IS NULL AND g."number" ~ '^[0-9]+$'), 0) + 1,
         COALESCE(((o."doc_number_start" -> t."document_type")::text)::int, 1)
       )
FROM "organizations" o
CROSS JOIN (VALUES ('ACT'), ('INVOICE'), ('RECONCILIATION'), ('CONTRACT'), ('HANDOVER')) AS t("document_type")
ON CONFLICT DO NOTHING;
