-- Multiple premises per tenant.
-- Keep tenants.space_id as the legacy primary premise during rollout, and
-- backfill the new join table from existing one-to-one assignments.

CREATE TABLE IF NOT EXISTS tenant_spaces (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  space_id text NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_spaces_tenant_id_space_id_key
  ON tenant_spaces(tenant_id, space_id);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_spaces_space_id_key
  ON tenant_spaces(space_id);

CREATE INDEX IF NOT EXISTS tenant_spaces_tenant_id_idx
  ON tenant_spaces(tenant_id);

INSERT INTO tenant_spaces (id, tenant_id, space_id, is_primary, created_at)
SELECT
  'cts_' || md5(t.id || ':' || t.space_id),
  t.id,
  t.space_id,
  true,
  COALESCE(t.created_at, CURRENT_TIMESTAMP)
FROM tenants t
WHERE t.space_id IS NOT NULL
ON CONFLICT (tenant_id, space_id) DO UPDATE
SET is_primary = true;

UPDATE spaces
SET status = 'OCCUPIED'
WHERE id IN (SELECT space_id FROM tenant_spaces);

ALTER TABLE tenant_spaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_client_access_tenant_spaces ON tenant_spaces;
CREATE POLICY deny_client_access_tenant_spaces
  ON tenant_spaces
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE tenant_spaces FROM anon, authenticated;
