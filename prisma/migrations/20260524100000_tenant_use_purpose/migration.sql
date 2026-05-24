-- Целевое использование арендуемого помещения — что арендатор делает.
-- Подставляется в п. 1.1 договора через placeholder {tenant_use_purpose}.
-- По умолчанию NULL — в договоре получим «по согласованному Сторонами назначению».
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "use_purpose" TEXT;
