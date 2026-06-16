-- Per-tenant исключение из эксплуатационного сбора здания.
-- Идемпотентно (custom SQL patch, применяется на каждом prod-деплое).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS service_fee_exempt boolean NOT NULL DEFAULT false;
