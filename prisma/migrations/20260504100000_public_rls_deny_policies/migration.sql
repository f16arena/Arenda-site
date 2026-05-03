-- Supabase Security Advisor 0008: RLS enabled with no policies.
-- The app uses Next.js server routes and Prisma for tenant scoping. Public
-- Supabase Data API roles should not read or mutate application tables.

DO $$
DECLARE
  table_record record;
  policy_name text;
BEGIN
  FOR table_record IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND NOT EXISTS (
        SELECT 1
        FROM pg_policy p
        WHERE p.polrelid = c.oid
      )
  LOOP
    policy_name := 'deny_client_access_' || table_record.table_name;

    IF length(policy_name) > 60 THEN
      policy_name := 'deny_client_access_' || substr(md5(table_record.table_name), 1, 16);
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      policy_name,
      table_record.schema_name,
      table_record.table_name
    );
  END LOOP;
END $$;

DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON TABLE %I.%I FROM anon, authenticated',
      table_record.schema_name,
      table_record.table_name
    );
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
