-- Supabase Security Advisor: 0013_rls_disabled_in_public
-- These tables are server-only and must not be accessible through PostgREST.

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_building_access ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.api_keys FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_building_access FROM anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'api_keys'
      AND policyname = 'api_keys_no_client_access'
  ) THEN
    CREATE POLICY api_keys_no_client_access
      ON public.api_keys
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_building_access'
      AND policyname = 'user_building_access_no_client_access'
  ) THEN
    CREATE POLICY user_building_access_no_client_access
      ON public.user_building_access
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;
