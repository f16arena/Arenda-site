ALTER TABLE "buildings"
  ADD COLUMN IF NOT EXISTS "address_country_code" TEXT,
  ADD COLUMN IF NOT EXISTS "address_region" TEXT,
  ADD COLUMN IF NOT EXISTS "address_city" TEXT,
  ADD COLUMN IF NOT EXISTS "address_settlement" TEXT,
  ADD COLUMN IF NOT EXISTS "address_street" TEXT,
  ADD COLUMN IF NOT EXISTS "address_house_number" TEXT,
  ADD COLUMN IF NOT EXISTS "address_postcode" TEXT,
  ADD COLUMN IF NOT EXISTS "address_latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "address_longitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "address_source" TEXT,
  ADD COLUMN IF NOT EXISTS "address_source_id" TEXT;

CREATE INDEX IF NOT EXISTS "buildings_organization_id_address_city_idx"
  ON "buildings"("organization_id", "address_city");

CREATE INDEX IF NOT EXISTS "buildings_organization_id_address_street_idx"
  ON "buildings"("organization_id", "address_street");

CREATE TABLE IF NOT EXISTS "address_cache" (
  "id" TEXT NOT NULL,
  "country_code" TEXT NOT NULL DEFAULT 'kz',
  "query_key" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "region" TEXT,
  "city" TEXT,
  "settlement" TEXT,
  "street" TEXT,
  "house_number" TEXT,
  "postcode" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "source" TEXT NOT NULL DEFAULT 'PHOTON',
  "source_id" TEXT,
  "raw" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "address_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "address_cache_source_source_id_key"
  ON "address_cache"("source", "source_id");

CREATE INDEX IF NOT EXISTS "address_cache_country_code_query_key_idx"
  ON "address_cache"("country_code", "query_key");

CREATE INDEX IF NOT EXISTS "address_cache_country_code_city_idx"
  ON "address_cache"("country_code", "city");

ALTER TABLE "address_cache" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'address_cache'
      AND policyname = 'deny_client_access_address_cache'
  ) THEN
    CREATE POLICY "deny_client_access_address_cache"
      ON "address_cache"
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE "address_cache" FROM anon, authenticated;
