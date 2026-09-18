-- Журнал открытий витрины: владелец должен видеть, что ссылку открывали и
-- сколько раз — иначе утечка планировки остаётся незамеченной.
-- IP не храним в открытом виде: только необратимый хеш, чтобы отличать
-- повторные заходы одного и того же посетителя, но не следить за человеком.
CREATE TABLE IF NOT EXISTS "builder_share_views" (
  "id"         TEXT NOT NULL,
  "token"      TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "opened_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "visitor"    TEXT,
  "user_agent" TEXT,
  CONSTRAINT "builder_share_views_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "builder_share_views_token_opened_at_idx" ON "builder_share_views" ("token", "opened_at");
CREATE INDEX IF NOT EXISTS "builder_share_views_project_id_opened_at_idx" ON "builder_share_views" ("project_id", "opened_at");
