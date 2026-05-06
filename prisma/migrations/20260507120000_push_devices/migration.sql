-- Push devices for mobile/browser notifications.
-- Idempotent because some environments historically used db push/manual SQL.

CREATE TABLE IF NOT EXISTS "push_devices" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'EXPO',
  "token" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "device_name" TEXT,
  "app_version" TEXT,
  "locale" TEXT,
  "timezone" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_devices_provider_token_key"
  ON "push_devices"("provider", "token");

CREATE INDEX IF NOT EXISTS "push_devices_user_id_is_active_idx"
  ON "push_devices"("user_id", "is_active");

CREATE INDEX IF NOT EXISTS "push_devices_organization_id_is_active_idx"
  ON "push_devices"("organization_id", "is_active");

ALTER TABLE "push_devices" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "push_devices" FROM anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'push_devices'
      AND policyname = 'deny_client_access_push_devices'
  ) THEN
    CREATE POLICY "deny_client_access_push_devices"
      ON "push_devices"
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;
