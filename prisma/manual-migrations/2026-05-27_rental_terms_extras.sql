-- Миграция 2026-05-27: дополнительные условия аренды (каникулы + депозит)
-- Применять в Supabase SQL Editor. Идемпотентно.

-- rentFreeMonths — арендные каникулы (первые N месяцев = 0 ₸)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS rent_free_months INTEGER NOT NULL DEFAULT 0;

-- depositAmount — гарантийный депозит (NULL = «1 месяц аренды» по умолчанию)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS deposit_amount DOUBLE PRECISION;
