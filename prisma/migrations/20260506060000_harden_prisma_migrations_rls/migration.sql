-- Supabase Security Advisor: protect Prisma's migration bookkeeping table too.
-- The application uses Prisma from server-side code; public Data API roles
-- should never read migration names, timestamps or checksums.

DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = '_prisma_migrations'
        AND policyname = 'prisma_migrations_no_client_access'
    ) THEN
      CREATE POLICY prisma_migrations_no_client_access
        ON public._prisma_migrations
        AS RESTRICTIVE
        FOR ALL
        TO anon, authenticated
        USING (false)
        WITH CHECK (false);
    END IF;

    REVOKE ALL ON TABLE public._prisma_migrations FROM anon, authenticated;
  END IF;
END $$;
