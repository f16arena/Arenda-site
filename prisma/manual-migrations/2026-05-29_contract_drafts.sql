-- Конструктор договоров (lib/contract-engine), Фаза 3 — персист черновиков.
-- Новая таблица, НЕ трогает contracts / document_templates. Применить в Supabase
-- SQL Editor. Идемпотентно (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS contract_drafts (
  id              text PRIMARY KEY,
  organization_id text NOT NULL,
  name            text NOT NULL DEFAULT 'Без названия',
  builder_state   jsonb NOT NULL,
  tenant_id       text,
  status          text NOT NULL DEFAULT 'DRAFT',
  created_by_id   text,
  created_at      timestamp(3) NOT NULL DEFAULT now(),
  updated_at      timestamp(3) NOT NULL DEFAULT now(),
  deleted_at      timestamp(3)
);

CREATE INDEX IF NOT EXISTS contract_drafts_org_status_updated_idx
  ON contract_drafts (organization_id, status, updated_at);
CREATE INDEX IF NOT EXISTS contract_drafts_org_tenant_idx
  ON contract_drafts (organization_id, tenant_id);
CREATE INDEX IF NOT EXISTS contract_drafts_deleted_idx
  ON contract_drafts (deleted_at);
