-- ============================================================
-- Migration 006: Динамические права доступа по ролям
-- ============================================================

CREATE TABLE IF NOT EXISTS role_permissions (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  role       TEXT NOT NULL,
  section    TEXT NOT NULL,
  can_view   BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role, section)
);

DROP TRIGGER IF EXISTS role_permissions_updated_at ON role_permissions;
CREATE TRIGGER role_permissions_updated_at
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Дефолтные права (можно потом править через UI) ──────────
-- Секции: dashboard, buildings, spaces, tenants, finances, meters,
--         contracts, requests, tasks, staff, complaints, messages,
--         analytics, settings, roles, users, documents, profile

-- OWNER — везде полный доступ
INSERT INTO role_permissions (role, section, can_view, can_edit) VALUES
  ('OWNER', 'dashboard', TRUE, TRUE),
  ('OWNER', 'buildings', TRUE, TRUE),
  ('OWNER', 'spaces', TRUE, TRUE),
  ('OWNER', 'tenants', TRUE, TRUE),
  ('OWNER', 'finances', TRUE, TRUE),
  ('OWNER', 'meters', TRUE, TRUE),
  ('OWNER', 'contracts', TRUE, TRUE),
  ('OWNER', 'requests', TRUE, TRUE),
  ('OWNER', 'tasks', TRUE, TRUE),
  ('OWNER', 'staff', TRUE, TRUE),
  ('OWNER', 'complaints', TRUE, TRUE),
  ('OWNER', 'messages', TRUE, TRUE),
  ('OWNER', 'analytics', TRUE, TRUE),
  ('OWNER', 'settings', TRUE, TRUE),
  ('OWNER', 'roles', TRUE, TRUE),
  ('OWNER', 'users', TRUE, TRUE),
  ('OWNER', 'documents', TRUE, TRUE),
  ('OWNER', 'profile', TRUE, TRUE)
ON CONFLICT (role, section) DO NOTHING;

-- ADMIN — почти всё кроме финансов (read-only) и users (нет)
INSERT INTO role_permissions (role, section, can_view, can_edit) VALUES
  ('ADMIN', 'dashboard', TRUE, FALSE),
  ('ADMIN', 'buildings', TRUE, TRUE),
  ('ADMIN', 'spaces', TRUE, TRUE),
  ('ADMIN', 'tenants', TRUE, TRUE),
  ('ADMIN', 'finances', TRUE, FALSE),
  ('ADMIN', 'meters', TRUE, TRUE),
  ('ADMIN', 'contracts', TRUE, TRUE),
  ('ADMIN', 'requests', TRUE, TRUE),
  ('ADMIN', 'tasks', TRUE, TRUE),
  ('ADMIN', 'staff', TRUE, FALSE),
  ('ADMIN', 'complaints', TRUE, TRUE),
  ('ADMIN', 'messages', TRUE, TRUE),
  ('ADMIN', 'analytics', TRUE, FALSE),
  ('ADMIN', 'settings', TRUE, TRUE),
  ('ADMIN', 'roles', TRUE, FALSE),
  ('ADMIN', 'users', FALSE, FALSE),
  ('ADMIN', 'documents', TRUE, TRUE),
  ('ADMIN', 'profile', TRUE, TRUE)
ON CONFLICT (role, section) DO NOTHING;

-- ACCOUNTANT — финансы, договоры, счётчики
INSERT INTO role_permissions (role, section, can_view, can_edit) VALUES
  ('ACCOUNTANT', 'dashboard', TRUE, FALSE),
  ('ACCOUNTANT', 'buildings', TRUE, FALSE),
  ('ACCOUNTANT', 'spaces', TRUE, FALSE),
  ('ACCOUNTANT', 'tenants', TRUE, FALSE),
  ('ACCOUNTANT', 'finances', TRUE, TRUE),
  ('ACCOUNTANT', 'meters', TRUE, TRUE),
  ('ACCOUNTANT', 'contracts', TRUE, TRUE),
  ('ACCOUNTANT', 'requests', FALSE, FALSE),
  ('ACCOUNTANT', 'tasks', FALSE, FALSE),
  ('ACCOUNTANT', 'staff', TRUE, TRUE),
  ('ACCOUNTANT', 'complaints', FALSE, FALSE),
  ('ACCOUNTANT', 'messages', TRUE, TRUE),
  ('ACCOUNTANT', 'analytics', TRUE, FALSE),
  ('ACCOUNTANT', 'settings', FALSE, FALSE),
  ('ACCOUNTANT', 'roles', FALSE, FALSE),
  ('ACCOUNTANT', 'users', FALSE, FALSE),
  ('ACCOUNTANT', 'documents', TRUE, TRUE),
  ('ACCOUNTANT', 'profile', TRUE, TRUE)
ON CONFLICT (role, section) DO NOTHING;

-- FACILITY_MANAGER — заявки, задачи, экстренные
INSERT INTO role_permissions (role, section, can_view, can_edit) VALUES
  ('FACILITY_MANAGER', 'dashboard', TRUE, FALSE),
  ('FACILITY_MANAGER', 'buildings', TRUE, FALSE),
  ('FACILITY_MANAGER', 'spaces', TRUE, FALSE),
  ('FACILITY_MANAGER', 'tenants', FALSE, FALSE),
  ('FACILITY_MANAGER', 'finances', FALSE, FALSE),
  ('FACILITY_MANAGER', 'meters', TRUE, TRUE),
  ('FACILITY_MANAGER', 'contracts', FALSE, FALSE),
  ('FACILITY_MANAGER', 'requests', TRUE, TRUE),
  ('FACILITY_MANAGER', 'tasks', TRUE, TRUE),
  ('FACILITY_MANAGER', 'staff', FALSE, FALSE),
  ('FACILITY_MANAGER', 'complaints', TRUE, TRUE),
  ('FACILITY_MANAGER', 'messages', TRUE, TRUE),
  ('FACILITY_MANAGER', 'analytics', FALSE, FALSE),
  ('FACILITY_MANAGER', 'settings', FALSE, FALSE),
  ('FACILITY_MANAGER', 'roles', FALSE, FALSE),
  ('FACILITY_MANAGER', 'users', FALSE, FALSE),
  ('FACILITY_MANAGER', 'documents', FALSE, FALSE),
  ('FACILITY_MANAGER', 'profile', TRUE, TRUE)
ON CONFLICT (role, section) DO NOTHING;
