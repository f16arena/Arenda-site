-- Публичная ссылка-витрина Building Studio: срок действия и отзыв.
-- Без срока ссылка жила вечно и её нельзя было отключить.
ALTER TABLE "builder_shares" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);
ALTER TABLE "builder_shares" ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(3);
ALTER TABLE "builder_shares" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;
CREATE INDEX IF NOT EXISTS "builder_shares_project_id_revoked_at_idx" ON "builder_shares" ("project_id", "revoked_at");
