-- Привязка к организации там, где её не было.
-- 1) Таблицы, где колонка organization_id уже была, но без внешнего ключа:
--    строки переживали удаление организации и «висели» в базе.
-- 2) Журналы и операционные записи (аудит, письма, задачи, уведомления,
--    жалобы) вообще не знали организацию — запрос «что происходило у меня»
--    был невозможен.

-- 1. Внешние ключи с каскадом
ALTER TABLE "generated_documents" DROP CONSTRAINT IF EXISTS "generated_documents_organization_id_fkey";
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_templates" DROP CONSTRAINT IF EXISTS "document_templates_organization_id_fkey";
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_signatures" DROP CONSTRAINT IF EXISTS "document_signatures_organization_id_fkey";
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_signature_requests" DROP CONSTRAINT IF EXISTS "document_signature_requests_organization_id_fkey";
ALTER TABLE "document_signature_requests" ADD CONSTRAINT "document_signature_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_drafts" DROP CONSTRAINT IF EXISTS "contract_drafts_organization_id_fkey";
ALTER TABLE "contract_drafts" ADD CONSTRAINT "contract_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "builder_projects" DROP CONSTRAINT IF EXISTS "builder_projects_organization_id_fkey";
ALTER TABLE "builder_projects" ADD CONSTRAINT "builder_projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "listing_drafts" DROP CONSTRAINT IF EXISTS "listing_drafts_organization_id_fkey";
ALTER TABLE "listing_drafts" ADD CONSTRAINT "listing_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "building_notices" DROP CONSTRAINT IF EXISTS "building_notices_organization_id_fkey";
ALTER TABLE "building_notices" ADD CONSTRAINT "building_notices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "push_devices" DROP CONSTRAINT IF EXISTS "push_devices_organization_id_fkey";
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mobile_sessions" DROP CONSTRAINT IF EXISTS "mobile_sessions_organization_id_fkey";
ALTER TABLE "mobile_sessions" ADD CONSTRAINT "mobile_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Организация в журналах и операционных записях
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "email_logs" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;

UPDATE "audit_logs" a SET "organization_id" = u."organization_id"
  FROM "users" u WHERE a."user_id" = u."id" AND a."organization_id" IS NULL;
UPDATE "email_logs" e SET "organization_id" = u."organization_id"
  FROM "users" u WHERE e."user_id" = u."id" AND e."organization_id" IS NULL;
UPDATE "email_logs" e SET "organization_id" = u."organization_id"
  FROM "tenants" t JOIN "users" u ON u."id" = t."user_id"
  WHERE e."tenant_id" = t."id" AND e."organization_id" IS NULL;
UPDATE "tasks" t SET "organization_id" = b."organization_id"
  FROM "buildings" b WHERE t."building_id" = b."id" AND t."organization_id" IS NULL;
UPDATE "tasks" t SET "organization_id" = u."organization_id"
  FROM "users" u WHERE t."created_by_id" = u."id" AND t."organization_id" IS NULL;
UPDATE "notifications" n SET "organization_id" = u."organization_id"
  FROM "users" u WHERE n."user_id" = u."id" AND n."organization_id" IS NULL;
UPDATE "complaints" c SET "organization_id" = u."organization_id"
  FROM "users" u WHERE c."user_id" = u."id" AND c."organization_id" IS NULL;

CREATE INDEX IF NOT EXISTS "audit_logs_organization_id_idx" ON "audit_logs"("organization_id");
CREATE INDEX IF NOT EXISTS "email_logs_organization_id_idx" ON "email_logs"("organization_id");
CREATE INDEX IF NOT EXISTS "tasks_organization_id_idx" ON "tasks"("organization_id");
CREATE INDEX IF NOT EXISTS "notifications_organization_id_idx" ON "notifications"("organization_id");
CREATE INDEX IF NOT EXISTS "complaints_organization_id_idx" ON "complaints"("organization_id");

ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_organization_id_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_logs" DROP CONSTRAINT IF EXISTS "email_logs_organization_id_fkey";
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_organization_id_fkey";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_organization_id_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "complaints" DROP CONSTRAINT IF EXISTS "complaints_organization_id_fkey";
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
