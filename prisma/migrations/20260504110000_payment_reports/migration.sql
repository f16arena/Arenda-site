CREATE TABLE IF NOT EXISTS "payment_reports" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "payment_date" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "payment_purpose" TEXT,
  "note" TEXT,
  "receipt_name" TEXT,
  "receipt_mime" TEXT,
  "receipt_data_url" TEXT,
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "payment_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payment_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payment_reports_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payment_reports_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "payment_reports_tenant_id_status_created_at_idx"
  ON "payment_reports"("tenant_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "payment_reports_user_id_idx"
  ON "payment_reports"("user_id");
CREATE INDEX IF NOT EXISTS "payment_reports_status_created_at_idx"
  ON "payment_reports"("status", "created_at");

ALTER TABLE "payment_reports" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_reports'
      AND policyname = 'deny_client_access_payment_reports'
  ) THEN
    CREATE POLICY "deny_client_access_payment_reports"
      ON "payment_reports"
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE "payment_reports" FROM anon, authenticated;
