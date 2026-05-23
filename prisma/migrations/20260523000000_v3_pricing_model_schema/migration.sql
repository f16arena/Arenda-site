-- v3 Pricing model: периоды, аддоны, услуги, Founders + расширения Plan/Subscription/Organization.

-- Plan: новые поля для площади, хранилища и Founders-параметров.
ALTER TABLE "plans"
  ADD COLUMN IF NOT EXISTS "max_area_sqm" INTEGER,
  ADD COLUMN IF NOT EXISTS "max_storage_gb" INTEGER,
  ADD COLUMN IF NOT EXISTS "founders_discount_pct" INTEGER DEFAULT 40,
  ADD COLUMN IF NOT EXISTS "discount_stack_cap_pct" INTEGER DEFAULT 50;

-- Subscription: период биллинга, breakdown скидок, авто-продление.
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "billing_period_code" TEXT DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS "months_count" INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "base_price_monthly" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "price_per_month_paid" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "discount_breakdown" TEXT,
  ADD COLUMN IF NOT EXISTS "auto_renew" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "reminder_sent_at" TIMESTAMP(3);

-- Organization: участие в Founders-программе.
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "is_founders_member" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "founders_locked_pct" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "founders_joined_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "founders_slot_number" INTEGER;

-- Периоды биллинга (1/3/6/12/24 мес).
CREATE TABLE IF NOT EXISTS "billing_periods" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "months_count" INTEGER NOT NULL,
  "discount_pct" INTEGER NOT NULL DEFAULT 0,
  "bonus_message" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "billing_periods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_periods_code_key" ON "billing_periods" ("code");

-- Аддоны (+здание/+арендаторы/+ГБ/+пользователь/брендирование).
CREATE TABLE IF NOT EXISTS "organization_addons" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "addon_code" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "price_monthly" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_addons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_addons_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "organization_addons_org_active_idx"
  ON "organization_addons" ("organization_id", "is_active");
CREATE INDEX IF NOT EXISTS "organization_addons_code_idx"
  ON "organization_addons" ("addon_code");

-- Разовые услуги (онбординг, юр.пакет, миграция Excel, интеграция 1С).
CREATE TABLE IF NOT EXISTS "organization_services" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "service_code" TEXT NOT NULL,
  "service_name" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "paid_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "payment_method" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_services_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_services_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "organization_services_org_idx"
  ON "organization_services" ("organization_id");
CREATE INDEX IF NOT EXISTS "organization_services_status_idx"
  ON "organization_services" ("status");

-- Singleton-состояние Founders-программы (всего 15 слотов и т.п.).
CREATE TABLE IF NOT EXISTS "founders_program_state" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "total_slots" INTEGER NOT NULL DEFAULT 15,
  "taken_slots" INTEGER NOT NULL DEFAULT 0,
  "discount_pct" INTEGER NOT NULL DEFAULT 40,
  "ends_at" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "founders_program_state_pkey" PRIMARY KEY ("id")
);
