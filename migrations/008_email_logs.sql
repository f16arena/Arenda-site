-- ============================================================
-- Migration 008: Журнал отправленных писем + tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS email_logs (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  recipient    TEXT NOT NULL,
  subject      TEXT NOT NULL,
  type         TEXT NOT NULL,          -- INVOICE | ACT | CONTRACT | NOTIFICATION | OTHER
  tenant_id    TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  external_id  TEXT,                    -- id из Resend
  status       TEXT NOT NULL DEFAULT 'SENT', -- QUEUED | SENT | FAILED | OPENED
  error        TEXT,
  opened_at    TIMESTAMPTZ,
  open_count   INTEGER NOT NULL DEFAULT 0,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_tenant ON email_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at);
