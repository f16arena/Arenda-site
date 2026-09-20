-- Права ролей — по организациям. Была одна общая таблица на всю платформу:
-- владелец любой организации, меняя права «Администратора», менял их всем
-- организациям сразу (аудит изоляции 20.09.2026).
--
-- Перенос без изменения поведения: текущие строки копируются каждой
-- организации, затем колонка становится обязательной.

ALTER TABLE "role_permissions" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;

-- Копия общих прав каждой организации (кроме уже перенесённых строк).
INSERT INTO "role_permissions" ("id", "organization_id", "role", "section", "can_view", "can_edit", "updated_at")
SELECT
  substr(md5(random()::text || clock_timestamp()::text), 1, 25),
  o."id", rp."role", rp."section", rp."can_view", rp."can_edit", now()
FROM "role_permissions" rp
CROSS JOIN "organizations" o
WHERE rp."organization_id" IS NULL
ON CONFLICT DO NOTHING;

DELETE FROM "role_permissions" WHERE "organization_id" IS NULL;

ALTER TABLE "role_permissions" ALTER COLUMN "organization_id" SET NOT NULL;

DROP INDEX IF EXISTS "role_permissions_role_section_key";
CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_organization_id_role_section_key"
  ON "role_permissions" ("organization_id", "role", "section");
CREATE INDEX IF NOT EXISTS "role_permissions_organization_id_role_idx"
  ON "role_permissions" ("organization_id", "role");

ALTER TABLE "role_permissions" DROP CONSTRAINT IF EXISTS "role_permissions_organization_id_fkey";
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
