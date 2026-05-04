-- Multiple bank accounts for tenants.
-- Keeps the legacy tenants.bank_name/iik/bik columns as a primary-account cache for older templates.

CREATE TABLE IF NOT EXISTS "tenant_bank_accounts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "label" TEXT,
  "bank_name" TEXT NOT NULL,
  "iik" TEXT NOT NULL,
  "bik" TEXT NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenant_bank_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_bank_accounts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_bank_accounts_tenant_id_iik_key"
  ON "tenant_bank_accounts"("tenant_id", "iik");

CREATE INDEX IF NOT EXISTS "tenant_bank_accounts_tenant_id_is_primary_idx"
  ON "tenant_bank_accounts"("tenant_id", "is_primary");

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_bank_accounts_one_primary_idx"
  ON "tenant_bank_accounts"("tenant_id")
  WHERE "is_primary";

INSERT INTO "tenant_bank_accounts" (
  "id",
  "tenant_id",
  "label",
  "bank_name",
  "iik",
  "bik",
  "is_primary",
  "created_at",
  "updated_at"
)
SELECT
  'tba_' || md5(t."id" || ':' || COALESCE(t."iik", '')),
  t."id",
  'Основной',
  COALESCE(NULLIF(trim(t."bank_name"), ''), 'Не указан'),
  upper(regexp_replace(t."iik", '\s+', '', 'g')),
  upper(regexp_replace(t."bik", '\s+', '', 'g')),
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" t
WHERE NULLIF(trim(COALESCE(t."iik", '')), '') IS NOT NULL
  AND NULLIF(trim(COALESCE(t."bik", '')), '') IS NOT NULL
ON CONFLICT ("tenant_id", "iik") DO UPDATE
SET
  "bank_name" = EXCLUDED."bank_name",
  "bik" = EXCLUDED."bik",
  "is_primary" = true,
  "updated_at" = CURRENT_TIMESTAMP;

ALTER TABLE "tenant_bank_accounts" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenant_bank_accounts'
      AND policyname = 'deny_client_access_tenant_bank_accounts'
  ) THEN
    CREATE POLICY "deny_client_access_tenant_bank_accounts"
      ON "tenant_bank_accounts"
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE "tenant_bank_accounts" FROM anon, authenticated;
