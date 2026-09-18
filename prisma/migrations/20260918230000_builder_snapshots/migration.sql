-- Автоснимки модели конструктора: страховка на случай, когда модель случайно
-- сломали и сохранили. Клиентская отмена (Ctrl+Z) живёт только до перезагрузки,
-- а тут — последние снимки на сервере, из которых можно восстановиться.
CREATE TABLE IF NOT EXISTS "builder_snapshots" (
  "id"         TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "revision"   INTEGER NOT NULL,
  "doc"        JSONB NOT NULL,
  "note"       TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "builder_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "builder_snapshots_project_created_idx" ON "builder_snapshots" ("project_id", "created_at" DESC);
