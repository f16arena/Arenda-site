-- ============================================================
-- ArendaPro — Supabase / PostgreSQL
-- Migration 001: Initial Schema
-- Run this in Supabase → SQL Editor
-- ============================================================


-- ============================================================
-- UTILITY: auto-update updated_at on row change
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- TABLE: buildings
-- Здание (обычно одна запись)
-- ============================================================

CREATE TABLE buildings (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name        TEXT NOT NULL,
  address     TEXT NOT NULL,
  description TEXT,
  phone       TEXT,
  email       TEXT,
  responsible TEXT,
  total_area  DOUBLE PRECISION,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- TABLE: emergency_contacts
-- Экстренные контакты здания
-- ============================================================

CREATE TABLE emergency_contacts (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  category    TEXT NOT NULL   -- FIRE | POLICE | GAS | ELECTRICIAN | PLUMBER | OTHER
);


-- ============================================================
-- TABLE: floors
-- Этажи (0 = подвал, 1, 2, 3 …)
-- ============================================================

CREATE TABLE floors (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  building_id  TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  number       INTEGER NOT NULL,
  name         TEXT NOT NULL,
  rate_per_sqm DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_area   DOUBLE PRECISION,
  layout_json  TEXT    -- JSON-строка плана этажа (drag-drop editor)
);


-- ============================================================
-- TABLE: spaces
-- Помещения / кабинеты на этаже
-- ============================================================

CREATE TABLE spaces (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  floor_id    TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  number      TEXT NOT NULL,
  area        DOUBLE PRECISION NOT NULL,
  status      TEXT NOT NULL DEFAULT 'VACANT',  -- VACANT | OCCUPIED | MAINTENANCE
  description TEXT
);


-- ============================================================
-- TABLE: users
-- Все пользователи: владелец, сотрудники, арендаторы
-- ============================================================

CREATE TABLE users (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name       TEXT NOT NULL,
  phone      TEXT UNIQUE,
  email      TEXT UNIQUE,
  password   TEXT NOT NULL,   -- bcrypt hash
  role       TEXT NOT NULL DEFAULT 'TENANT',
  -- OWNER | ADMIN | ACCOUNTANT | FACILITY_MANAGER | EMPLOYEE | TENANT
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- TABLE: tenants
-- Профиль арендатора (1-к-1 с users)
-- ============================================================

CREATE TABLE tenants (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id        TEXT NOT NULL UNIQUE REFERENCES users(id),
  space_id       TEXT UNIQUE REFERENCES spaces(id),
  company_name   TEXT NOT NULL,
  bin            TEXT,             -- БИН (юрлицо) или ИИН (физлицо)
  bank_name      TEXT,
  iik            TEXT,             -- номер счёта (IBAN)
  bik            TEXT,             -- БИК банка
  legal_type     TEXT NOT NULL DEFAULT 'IP',  -- IP | TOO | AO | PHYSICAL
  category       TEXT,
  needs_cleaning BOOLEAN NOT NULL DEFAULT FALSE,
  cleaning_fee   DOUBLE PRECISION NOT NULL DEFAULT 0,
  custom_rate    DOUBLE PRECISION,  -- индивидуальная ставка ₸/м² (NULL = берём из floors)
  contract_start TIMESTAMPTZ,
  contract_end   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- TABLE: staff
-- Профиль сотрудника (1-к-1 с users)
-- ============================================================

CREATE TABLE staff (
  id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id   TEXT NOT NULL UNIQUE REFERENCES users(id),
  position  TEXT NOT NULL,
  salary    DOUBLE PRECISION NOT NULL DEFAULT 0,
  hire_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- TABLE: salary_payments
-- Зарплатные выплаты сотруднику по периодам
-- ============================================================

CREATE TABLE salary_payments (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  staff_id   TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  amount     DOUBLE PRECISION NOT NULL,
  period     TEXT NOT NULL,   -- YYYY-MM
  paid_at    TIMESTAMPTZ,
  status     TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | PAID
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- TABLE: charges
-- Начисления арендатору (аренда, ком. услуги, пени …)
-- ============================================================

CREATE TABLE charges (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period      TEXT NOT NULL,   -- YYYY-MM
  type        TEXT NOT NULL,   -- RENT | ELECTRICITY | WATER | HEATING | CLEANING | PENALTY | OTHER
  amount      DOUBLE PRECISION NOT NULL,
  description TEXT,
  is_paid     BOOLEAN NOT NULL DEFAULT FALSE,
  due_date    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_charges_tenant_period ON charges(tenant_id, period);
CREATE INDEX idx_charges_period        ON charges(period);
CREATE INDEX idx_charges_is_paid       ON charges(is_paid) WHERE is_paid = FALSE;


-- ============================================================
-- TABLE: payments
-- Факт оплаты от арендатора
-- ============================================================

CREATE TABLE payments (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount       DOUBLE PRECISION NOT NULL,
  payment_date TIMESTAMPTZ NOT NULL,
  method       TEXT NOT NULL DEFAULT 'TRANSFER',  -- TRANSFER | CASH | KASPI | CARD
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_date   ON payments(payment_date);


-- ============================================================
-- TABLE: expenses
-- Расходы здания (электроэнергия, ремонт, зарплата …)
-- ============================================================

CREATE TABLE expenses (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  building_id TEXT NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,   -- ELECTRICITY | WATER | HEATING | SALARY | REPAIR | CLEANING | SECURITY | OTHER
  amount      DOUBLE PRECISION NOT NULL,
  period      TEXT NOT NULL,   -- YYYY-MM
  description TEXT,
  date        TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_period ON expenses(period);


-- ============================================================
-- TABLE: meters
-- Счётчики (один на помещение, типов может быть несколько)
-- ============================================================

CREATE TABLE meters (
  id       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  type     TEXT NOT NULL,   -- ELECTRICITY | WATER | HEAT
  number   TEXT NOT NULL
);


-- ============================================================
-- TABLE: meter_readings
-- Показания счётчика по периодам
-- ============================================================

CREATE TABLE meter_readings (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  meter_id   TEXT NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
  period     TEXT NOT NULL,   -- YYYY-MM
  value      DOUBLE PRECISION NOT NULL,
  previous   DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_meter_readings_unique ON meter_readings(meter_id, period);
CREATE INDEX idx_meter_readings_meter ON meter_readings(meter_id);


-- ============================================================
-- TABLE: contracts
-- Договора аренды
-- ============================================================

CREATE TABLE contracts (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number     TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'STANDARD',
  content    TEXT NOT NULL,   -- тело договора (HTML или plain text)
  status     TEXT NOT NULL DEFAULT 'DRAFT',  -- DRAFT | SENT | SIGNED | REJECTED | ARCHIVED
  signed_at  TIMESTAMPTZ,
  start_date TIMESTAMPTZ,
  end_date   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- TABLE: tenant_documents
-- Загруженные файлы арендатора (Supabase Storage)
-- ============================================================

CREATE TABLE tenant_documents (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,   -- CONTRACT | ACT | INVOICE | OTHER
  name       TEXT NOT NULL,
  file_url   TEXT NOT NULL,   -- URL из Supabase Storage
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- TABLE: requests
-- Заявки арендаторов (ремонт, уборка, вопросы …)
-- ============================================================

CREATE TABLE requests (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'OTHER',    -- TECHNICAL | INTERNET | CLEANING | QUESTION | OTHER
  priority    TEXT NOT NULL DEFAULT 'MEDIUM',   -- LOW | MEDIUM | HIGH | URGENT
  status      TEXT NOT NULL DEFAULT 'NEW',      -- NEW | IN_PROGRESS | DONE | POSTPONED | CLOSED
  assignee_id TEXT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER requests_updated_at
  BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_requests_status    ON requests(status);
CREATE INDEX idx_requests_tenant    ON requests(tenant_id);
CREATE INDEX idx_requests_assignee  ON requests(assignee_id);


-- ============================================================
-- TABLE: request_comments
-- Комментарии к заявкам (переписка сотрудник ↔ арендатор)
-- ============================================================

CREATE TABLE request_comments (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL REFERENCES users(id),
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_request_comments_request ON request_comments(request_id);


-- ============================================================
-- TABLE: tasks
-- Внутренние задачи (хозяйственные, ремонтные …)
-- ============================================================

CREATE TABLE tasks (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  building_id    TEXT REFERENCES buildings(id),
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT NOT NULL DEFAULT 'OTHER',   -- REPAIR | CLEANING | SECURITY | INSPECTION | OTHER
  floor_number   INTEGER,
  space_number   TEXT,
  estimated_cost DOUBLE PRECISION,
  actual_cost    DOUBLE PRECISION,
  due_date       TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'NEW',     -- NEW | IN_PROGRESS | DONE
  priority       TEXT NOT NULL DEFAULT 'MEDIUM',  -- LOW | MEDIUM | HIGH | URGENT
  created_by_id  TEXT NOT NULL REFERENCES users(id),
  assigned_to_id TEXT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_tasks_status   ON tasks(status);
CREATE INDEX idx_tasks_assignee ON tasks(assigned_to_id);


-- ============================================================
-- TABLE: messages
-- Внутренняя переписка между пользователями
-- ============================================================

CREATE TABLE messages (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  from_id        TEXT NOT NULL REFERENCES users(id),
  to_id          TEXT NOT NULL REFERENCES users(id),
  subject        TEXT,
  body           TEXT NOT NULL,
  is_read        BOOLEAN NOT NULL DEFAULT FALSE,
  attachment_url TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_to_unread ON messages(to_id, is_read);


-- ============================================================
-- TABLE: complaints
-- Жалобы и предложения от арендаторов
-- ============================================================

CREATE TABLE complaints (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id    TEXT REFERENCES users(id),  -- NULL если анонимно
  name       TEXT,                        -- имя если анонимно
  text       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'NEW',  -- NEW | REVIEWED | RESOLVED
  response   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
