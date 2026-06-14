-- Рассрочка по долгу: план реструктуризации + график взносов. Пока план ACTIVE,
-- по покрытым начислениям не капает пеня (см. cron check-deadlines).

CREATE TABLE IF NOT EXISTS "debt_installment_plans" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "total_amount" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "debt_installment_plans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "debt_installment_plans_tenant_id_status_idx"
  ON "debt_installment_plans" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "debt_installments" (
  "id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "seq" INTEGER NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "is_paid" BOOLEAN NOT NULL DEFAULT false,
  "paid_at" TIMESTAMP(3),
  "payment_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "debt_installments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "debt_installments_plan_id_seq_idx"
  ON "debt_installments" ("plan_id", "seq");
CREATE INDEX IF NOT EXISTS "debt_installments_is_paid_due_date_idx"
  ON "debt_installments" ("is_paid", "due_date");

-- Связь начисления с планом рассрочки.
ALTER TABLE "charges" ADD COLUMN IF NOT EXISTS "installment_plan_id" TEXT;
CREATE INDEX IF NOT EXISTS "charges_installment_plan_id_idx"
  ON "charges" ("installment_plan_id");

-- Внешние ключи.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debt_installment_plans_tenant_id_fkey') THEN
    ALTER TABLE "debt_installment_plans"
      ADD CONSTRAINT "debt_installment_plans_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debt_installments_plan_id_fkey') THEN
    ALTER TABLE "debt_installments"
      ADD CONSTRAINT "debt_installments_plan_id_fkey"
      FOREIGN KEY ("plan_id") REFERENCES "debt_installment_plans" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'charges_installment_plan_id_fkey') THEN
    ALTER TABLE "charges"
      ADD CONSTRAINT "charges_installment_plan_id_fkey"
      FOREIGN KEY ("installment_plan_id") REFERENCES "debt_installment_plans" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS: серверный доступ только через Prisma, deny-by-default для Supabase Data API.
ALTER TABLE "debt_installment_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "debt_installments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "debt_installment_plans" FROM anon, authenticated;
REVOKE ALL ON TABLE "debt_installments" FROM anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='debt_installment_plans' AND policyname='debt_installment_plans_no_client_access') THEN
    CREATE POLICY debt_installment_plans_no_client_access ON public.debt_installment_plans
      AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='debt_installments' AND policyname='debt_installments_no_client_access') THEN
    CREATE POLICY debt_installments_no_client_access ON public.debt_installments
      AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;
