CREATE TABLE IF NOT EXISTS "web_vital_metrics" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "user_id" TEXT,
  "name" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "rating" TEXT,
  "delta" DOUBLE PRECISION,
  "navigation_type" TEXT,
  "path" TEXT,
  "url" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "web_vital_metrics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "web_vital_metrics_organization_id_name_created_at_idx"
  ON "web_vital_metrics"("organization_id", "name", "created_at");

CREATE INDEX IF NOT EXISTS "web_vital_metrics_name_created_at_idx"
  ON "web_vital_metrics"("name", "created_at");

CREATE INDEX IF NOT EXISTS "web_vital_metrics_path_name_created_at_idx"
  ON "web_vital_metrics"("path", "name", "created_at");

ALTER TABLE "web_vital_metrics" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'web_vital_metrics'
      AND policyname = 'deny_client_access_web_vital_metrics'
  ) THEN
    CREATE POLICY "deny_client_access_web_vital_metrics"
      ON "web_vital_metrics"
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE "web_vital_metrics" FROM anon, authenticated;
