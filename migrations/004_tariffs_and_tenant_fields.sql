-- ============================================================
-- Migration 004: Тарифы, ИИН, расширенные поля арендатора, аренда этажа целиком
-- ============================================================

-- Тарифы (электричество, вода, мусор и т.д.)
CREATE TABLE IF NOT EXISTS tariffs (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,           -- ELECTRICITY | WATER | HEATING | GARBAGE | INTERNET | OTHER
  name        TEXT NOT NULL,
  rate        DOUBLE PRECISION NOT NULL,
  unit        TEXT NOT NULL DEFAULT 'ед.',
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER tariffs_updated_at
  BEFORE UPDATE ON tariffs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_tariffs_building ON tariffs(building_id);

-- Расширения арендатора
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS iin TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS legal_address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS actual_address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS director_name TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS director_position TEXT;

-- Аренда этажа целиком за фиксированную сумму
ALTER TABLE floors ADD COLUMN IF NOT EXISTS fixed_monthly_rent DOUBLE PRECISION;
ALTER TABLE floors ADD COLUMN IF NOT EXISTS full_floor_tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_floors_full_floor_tenant ON floors(full_floor_tenant_id);

-- Стартовые тарифы для F16 Arena (можно потом изменить через UI)
INSERT INTO tariffs (building_id, type, name, rate, unit, description)
SELECT b.id, 'ELECTRICITY', 'Электроэнергия', 22, 'кВт·ч', 'Тариф для коммерческих помещений'
FROM buildings b WHERE b.is_active = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO tariffs (building_id, type, name, rate, unit, description)
SELECT b.id, 'WATER', 'Холодная вода', 250, 'м³', NULL
FROM buildings b WHERE b.is_active = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO tariffs (building_id, type, name, rate, unit, description)
SELECT b.id, 'GARBAGE', 'Вывоз мусора', 5000, 'месяц', 'Фиксированная плата'
FROM buildings b WHERE b.is_active = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO tariffs (building_id, type, name, rate, unit, description)
SELECT b.id, 'HEATING', 'Отопление', 180, 'м²', 'За отопительный сезон'
FROM buildings b WHERE b.is_active = TRUE
ON CONFLICT DO NOTHING;
