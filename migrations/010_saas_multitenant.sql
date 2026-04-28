-- ============================================================
-- Migration 010: SaaS multi-tenancy — Organizations, Plans, Subscriptions
-- ============================================================

-- ── 1. Тарифы ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  code          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  price_monthly DOUBLE PRECISION NOT NULL DEFAULT 0,
  price_yearly  DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_buildings INTEGER,
  max_tenants   INTEGER,
  max_users     INTEGER,
  max_leads     INTEGER,
  features      TEXT NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Дефолтные тарифы
INSERT INTO plans (code, name, description, price_monthly, max_buildings, max_tenants, max_users, max_leads, features, sort_order) VALUES
  ('FREE', 'Бесплатный', 'Для теста системы', 0, 1, 10, 2, 5,
    '{"emailNotifications":false,"telegramBot":false,"floorEditor":false,"contractTemplates":true,"bankImport":false,"excelExport":false,"export1c":false,"cmdkSearch":true,"customDomain":false,"api":false,"whiteLabel":false,"aiAssistant":false,"prioritySupport":false}',
    0),
  ('STARTER', 'Стартовый', 'Для малого БЦ', 15000, 1, 50, 5, 50,
    '{"emailNotifications":true,"telegramBot":true,"floorEditor":true,"contractTemplates":true,"bankImport":false,"excelExport":false,"export1c":false,"cmdkSearch":true,"customDomain":false,"api":false,"whiteLabel":false,"aiAssistant":false,"prioritySupport":false}',
    1),
  ('PRO', 'Профи', 'Для нескольких БЦ', 35000, 5, NULL, NULL, NULL,
    '{"emailNotifications":true,"telegramBot":true,"floorEditor":true,"contractTemplates":true,"bankImport":true,"excelExport":true,"export1c":true,"cmdkSearch":true,"customDomain":false,"api":false,"whiteLabel":false,"aiAssistant":true,"prioritySupport":false}',
    2),
  ('ENTERPRISE', 'Корпоративный', 'Безлимит + интеграции', 100000, NULL, NULL, NULL, NULL,
    '{"emailNotifications":true,"telegramBot":true,"floorEditor":true,"contractTemplates":true,"bankImport":true,"excelExport":true,"export1c":true,"cmdkSearch":true,"customDomain":true,"api":true,"whiteLabel":true,"aiAssistant":true,"prioritySupport":true}',
    3)
ON CONFLICT (code) DO NOTHING;

-- ── 2. Организации ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_suspended    BOOLEAN NOT NULL DEFAULT FALSE,
  owner_user_id   TEXT,
  plan_id         TEXT REFERENCES plans(id),
  plan_expires_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS organizations_updated_at ON organizations;
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 3. Подписки (история) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id         TEXT NOT NULL REFERENCES plans(id),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  paid_amount     DOUBLE PRECISION NOT NULL DEFAULT 0,
  payment_method  TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subs_org ON subscriptions(organization_id);

-- ── 4. User: organizationId + isPlatformOwner ────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_owner BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 5. Building: organizationId ──────────────────────────────
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS organization_id TEXT;

-- ── 6. Backfill: создаём первую организацию для текущих данных
DO $$
DECLARE
  pro_plan_id TEXT;
  org_id TEXT := 'org_f16';
BEGIN
  -- Проверим что org ещё не создана
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = org_id) THEN
    SELECT id INTO pro_plan_id FROM plans WHERE code = 'PRO' LIMIT 1;
    INSERT INTO organizations (id, name, slug, plan_id, plan_expires_at)
    VALUES (
      org_id,
      'БЦ F16',
      'f16',
      pro_plan_id,
      NOW() + INTERVAL '10 years'
    );

    -- Запишем стартовую подписку
    INSERT INTO subscriptions (organization_id, plan_id, expires_at, paid_amount, payment_method, notes)
    VALUES (org_id, pro_plan_id, NOW() + INTERVAL '10 years', 0, 'OWNER_GRANT', 'Стартовая подписка для основной организации');
  END IF;

  -- Все существующие здания → org_f16
  UPDATE buildings SET organization_id = org_id WHERE organization_id IS NULL;

  -- f16arena@gmail.com → платформа-админ
  UPDATE users SET is_platform_owner = TRUE, organization_id = NULL
  WHERE email = 'f16arena@gmail.com';

  -- Все остальные users → org_f16
  UPDATE users SET organization_id = org_id
  WHERE organization_id IS NULL AND is_platform_owner = FALSE;
END $$;

-- Теперь сделаем organization_id на buildings обязательным + FK
ALTER TABLE buildings ALTER COLUMN organization_id SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_buildings_org') THEN
    ALTER TABLE buildings ADD CONSTRAINT fk_buildings_org
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_buildings_org ON buildings(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
