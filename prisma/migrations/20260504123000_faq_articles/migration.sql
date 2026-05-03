CREATE TABLE IF NOT EXISTS "faq_articles" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "steps" TEXT,
  "tags" TEXT,
  "href" TEXT,
  "href_label" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "faq_articles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "faq_articles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "faq_articles_organization_id_slug_key"
  ON "faq_articles"("organization_id", "slug");

CREATE INDEX IF NOT EXISTS "faq_articles_organization_id_audience_is_active_sort_order_idx"
  ON "faq_articles"("organization_id", "audience", "is_active", "sort_order");

ALTER TABLE "faq_articles" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'faq_articles'
      AND policyname = 'deny_client_access_faq_articles'
  ) THEN
    CREATE POLICY "deny_client_access_faq_articles"
      ON "faq_articles"
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE "faq_articles" FROM anon, authenticated;
