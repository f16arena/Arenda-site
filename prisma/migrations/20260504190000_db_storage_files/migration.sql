CREATE TABLE IF NOT EXISTS "stored_files" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "owner_type" TEXT NOT NULL,
  "owner_id" TEXT,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "extension" TEXT,
  "original_size" INTEGER NOT NULL,
  "compressed_size" INTEGER NOT NULL,
  "compression" TEXT NOT NULL DEFAULT 'GZIP',
  "sha256" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "uploaded_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stored_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stored_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "stored_files_organization_id_owner_type_owner_id_idx"
  ON "stored_files"("organization_id", "owner_type", "owner_id");

CREATE INDEX IF NOT EXISTS "stored_files_organization_id_created_at_idx"
  ON "stored_files"("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "stored_files_uploaded_by_id_idx"
  ON "stored_files"("uploaded_by_id");

ALTER TABLE "tenant_documents"
  ADD COLUMN IF NOT EXISTS "storage_file_id" TEXT;

ALTER TABLE "tenant_documents"
  ALTER COLUMN "file_url" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_documents_storage_file_id_key'
  ) THEN
    ALTER TABLE "tenant_documents"
      ADD CONSTRAINT "tenant_documents_storage_file_id_key" UNIQUE ("storage_file_id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "tenant_documents_storage_file_id_idx"
  ON "tenant_documents"("storage_file_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_documents_storage_file_id_fkey'
  ) THEN
    ALTER TABLE "tenant_documents"
      ADD CONSTRAINT "tenant_documents_storage_file_id_fkey"
      FOREIGN KEY ("storage_file_id") REFERENCES "stored_files"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "payment_reports"
  ADD COLUMN IF NOT EXISTS "receipt_file_id" TEXT;

CREATE INDEX IF NOT EXISTS "payment_reports_receipt_file_id_idx"
  ON "payment_reports"("receipt_file_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payment_reports_receipt_file_id_fkey'
  ) THEN
    ALTER TABLE "payment_reports"
      ADD CONSTRAINT "payment_reports_receipt_file_id_fkey"
      FOREIGN KEY ("receipt_file_id") REFERENCES "stored_files"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "stored_files" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stored_files'
      AND policyname = 'deny_client_access_stored_files'
  ) THEN
    CREATE POLICY "deny_client_access_stored_files"
      ON "stored_files"
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE "stored_files" FROM anon, authenticated;
