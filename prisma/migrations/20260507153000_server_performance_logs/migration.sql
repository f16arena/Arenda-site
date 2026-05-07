CREATE TABLE IF NOT EXISTS "server_performance_logs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "user_id" TEXT,
  "route" TEXT NOT NULL,
  "step" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'ROUTE',
  "duration_ms" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ok',
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "server_performance_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "server_performance_logs_organization_id_route_created_at_idx"
  ON "server_performance_logs"("organization_id", "route", "created_at");

CREATE INDEX IF NOT EXISTS "server_performance_logs_route_created_at_idx"
  ON "server_performance_logs"("route", "created_at");

CREATE INDEX IF NOT EXISTS "server_performance_logs_kind_created_at_idx"
  ON "server_performance_logs"("kind", "created_at");

CREATE INDEX IF NOT EXISTS "server_performance_logs_status_created_at_idx"
  ON "server_performance_logs"("status", "created_at");

CREATE INDEX IF NOT EXISTS "server_performance_logs_duration_ms_created_at_idx"
  ON "server_performance_logs"("duration_ms", "created_at");

ALTER TABLE "server_performance_logs" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'server_performance_logs'
      AND policyname = 'deny_client_access_server_performance_logs'
  ) THEN
    CREATE POLICY "deny_client_access_server_performance_logs"
      ON "server_performance_logs"
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE "server_performance_logs" FROM anon, authenticated;
