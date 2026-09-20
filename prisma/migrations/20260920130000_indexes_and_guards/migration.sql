-- 1. Защита от двойного начисления. Индекс существует в боевой базе с
-- migrations/020_charges_unique.sql (запускался руками в Supabase), но в
-- prisma/migrations его не было: на новой базе защиты бы не оказалось.
CREATE UNIQUE INDEX IF NOT EXISTS "charges_tenant_period_type_unique"
  ON "charges" ("tenant_id", "period", "type") WHERE "deleted_at" IS NULL;

-- 2. Частые выборки идут с фильтром deleted_at IS NULL — частичные индексы
-- вместо бесполезных индексов по одному двухзначному полю.
CREATE INDEX IF NOT EXISTS "charges_live_tenant_due" ON "charges" ("tenant_id", "due_date") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "charges_live_unpaid" ON "charges" ("is_paid", "due_date") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "payments_live_tenant_date" ON "payments" ("tenant_id", "payment_date") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "contracts_live_tenant_status" ON "contracts" ("tenant_id", "status") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "stored_files_live_org_category" ON "stored_files" ("organization_id", "category", "created_at") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "generated_documents_live_org_type" ON "generated_documents" ("organization_id", "document_type", "generated_at") WHERE "deleted_at" IS NULL;

-- 3. Составные индексы под частые запросы страниц.
CREATE INDEX IF NOT EXISTS "floors_building_id_kind_idx" ON "floors" ("building_id", "kind");
CREATE INDEX IF NOT EXISTS "notifications_user_id_is_read_created_at_idx" ON "notifications" ("user_id", "is_read", "created_at");
CREATE INDEX IF NOT EXISTS "generated_documents_organization_id_document_type_number_idx" ON "generated_documents" ("organization_id", "document_type", "number");
CREATE INDEX IF NOT EXISTS "tenants_building_id_deleted_at_idx" ON "tenants" ("building_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "tasks_status_due_date_idx" ON "tasks" ("status", "due_date");
CREATE INDEX IF NOT EXISTS "audit_logs_entity_entity_id_created_at_idx" ON "audit_logs" ("entity", "entity_id", "created_at");

-- 4. Дубль: у verification_tokens токен уже уникален.
DROP INDEX IF EXISTS "verification_tokens_token_idx";

-- 5. Тариф нельзя удалить, пока к нему привязаны организации (раньше
-- организация молча оставалась без тарифа).
ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_plan_id_fkey";
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
