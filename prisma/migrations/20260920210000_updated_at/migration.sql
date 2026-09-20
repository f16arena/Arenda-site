-- Отметка «изменено» там, где её не было: без неё непонятно, когда правили
-- начисление, оплату, договор, здание, этаж, помещение или уведомление.
-- Для существующих строк ставим дату создания (или текущее время).
ALTER TABLE "charges" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "floors" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "spaces" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "charges" SET "updated_at" = "created_at" WHERE "updated_at" > "created_at" AND "created_at" IS NOT NULL;
UPDATE "payments" SET "updated_at" = "created_at" WHERE "updated_at" > "created_at" AND "created_at" IS NOT NULL;
UPDATE "contracts" SET "updated_at" = "created_at" WHERE "updated_at" > "created_at" AND "created_at" IS NOT NULL;
UPDATE "buildings" SET "updated_at" = "created_at" WHERE "updated_at" > "created_at" AND "created_at" IS NOT NULL;
UPDATE "notifications" SET "updated_at" = "created_at" WHERE "updated_at" > "created_at" AND "created_at" IS NOT NULL;
