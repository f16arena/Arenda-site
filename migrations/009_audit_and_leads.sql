-- ============================================================
-- Migration 009: Audit log + Leads (CRM)
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_name  TEXT,
  user_role  TEXT,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  details    TEXT,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS leads (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  building_id   TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  contact       TEXT NOT NULL,
  contact_type  TEXT NOT NULL DEFAULT 'PHONE',
  company_name  TEXT,
  legal_type    TEXT,
  desired_area  DOUBLE PRECISION,
  budget        DOUBLE PRECISION,
  space_id      TEXT REFERENCES spaces(id) ON DELETE SET NULL,
  source        TEXT NOT NULL DEFAULT 'OTHER',
  status        TEXT NOT NULL DEFAULT 'NEW',
  notes         TEXT,
  booked_until  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_building ON leads(building_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
