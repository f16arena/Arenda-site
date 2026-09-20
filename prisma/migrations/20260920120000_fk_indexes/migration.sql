-- Индексы по внешним ключам: без них Postgres сканирует таблицу целиком
-- (анализатор Supabase, 13 замечаний). CONCURRENTLY нельзя внутри транзакции
-- миграции, таблицы маленькие — обычный CREATE INDEX.
CREATE INDEX IF NOT EXISTS "buildings_administrator_user_id_idx" ON "buildings"("administrator_user_id");
CREATE INDEX IF NOT EXISTS "complaints_user_id_idx" ON "complaints"("user_id");
CREATE INDEX IF NOT EXISTS "emergency_contacts_building_id_idx" ON "emergency_contacts"("building_id");
CREATE INDEX IF NOT EXISTS "organizations_plan_id_idx" ON "organizations"("plan_id");
CREATE INDEX IF NOT EXISTS "payment_reports_payment_id_idx" ON "payment_reports"("payment_id");
CREATE INDEX IF NOT EXISTS "payment_reports_reviewed_by_id_idx" ON "payment_reports"("reviewed_by_id");
CREATE INDEX IF NOT EXISTS "payments_receipt_confirmed_by_id_idx" ON "payments"("receipt_confirmed_by_id");
CREATE INDEX IF NOT EXISTS "request_comments_request_id_idx" ON "request_comments"("request_id");
CREATE INDEX IF NOT EXISTS "request_comments_author_id_idx" ON "request_comments"("author_id");
CREATE INDEX IF NOT EXISTS "salary_payments_staff_id_idx" ON "salary_payments"("staff_id");
CREATE INDEX IF NOT EXISTS "stored_files_building_id_idx" ON "stored_files"("building_id");
CREATE INDEX IF NOT EXISTS "stored_files_tenant_id_idx" ON "stored_files"("tenant_id");
CREATE INDEX IF NOT EXISTS "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

-- Дубль индекса на generated_documents (два одинаковых) — оставляем один.
DROP INDEX IF EXISTS "generated_documents_organization_id_document_type_generated_at_";
