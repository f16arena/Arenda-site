-- Building Studio: проекты 3D-моделей + read-only витрины (Showcase).
CREATE TABLE IF NOT EXISTS "builder_projects" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Без названия',
  "building_id" TEXT,
  "doc" JSONB NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "builder_projects_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "builder_projects_organization_id_updated_at_idx" ON "builder_projects" ("organization_id", "updated_at");

CREATE TABLE IF NOT EXISTS "builder_shares" (
  "token" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "builder_shares_pkey" PRIMARY KEY ("token")
);
CREATE INDEX IF NOT EXISTS "builder_shares_project_id_idx" ON "builder_shares" ("project_id");
