-- Реквизиты ИС ЭСФ на организацию (мультиорг). Секреты шифруются в приложении.
CREATE TABLE IF NOT EXISTS "org_esf_configs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "ws_username" TEXT,
  "ws_password_enc" TEXT,
  "signer_iin" TEXT,
  "cert_pin_enc" TEXT,
  "cert_path" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_esf_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_esf_configs_organization_id_key"
  ON "org_esf_configs" ("organization_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_esf_configs_organization_id_fkey') THEN
    ALTER TABLE "org_esf_configs"
      ADD CONSTRAINT "org_esf_configs_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS: серверный доступ только через Prisma (содержит секреты ЭСФ).
ALTER TABLE "org_esf_configs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "org_esf_configs" FROM anon, authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='org_esf_configs' AND policyname='org_esf_configs_no_client_access') THEN
    CREATE POLICY org_esf_configs_no_client_access ON public.org_esf_configs
      AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;
