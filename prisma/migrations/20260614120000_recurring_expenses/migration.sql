-- Постоянные (повторяющиеся) расходы: шаблоны зарплаты, вывоза мусора,
-- технички, интернета, отопления-зимой. Раз в месяц из шаблона создаётся
-- запись в expenses (дедуп по recurring_expense_id + period).

CREATE TABLE IF NOT EXISTS "recurring_expenses" (
  "id" TEXT NOT NULL,
  "building_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "description" TEXT,
  "day_of_month" INTEGER NOT NULL DEFAULT 1,
  "months" TEXT,
  "cash_account_id" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "recurring_expenses_building_id_is_active_idx"
  ON "recurring_expenses" ("building_id", "is_active");

-- Связь шаблона со зданием (каскадное удаление вместе со зданием).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recurring_expenses_building_id_fkey'
  ) THEN
    ALTER TABLE "recurring_expenses"
      ADD CONSTRAINT "recurring_expenses_building_id_fkey"
      FOREIGN KEY ("building_id") REFERENCES "buildings" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Ссылка на шаблон у конкретного расхода + дедуп за период.
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "recurring_expense_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_recurring_expense_id_fkey'
  ) THEN
    ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_recurring_expense_id_fkey"
      FOREIGN KEY ("recurring_expense_id") REFERENCES "recurring_expenses" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Уникальность (recurring_expense_id, period): один расход на шаблон за месяц.
-- NULL-ы в Postgres различны, поэтому разовые расходы (recurring_expense_id IS NULL)
-- не ограничиваются.
CREATE UNIQUE INDEX IF NOT EXISTS "expenses_recurring_expense_id_period_key"
  ON "expenses" ("recurring_expense_id", "period");

-- RLS: таблица только для серверного доступа через Prisma (deny-by-default для
-- ролей Supabase Data API), как у остальных прикладных таблиц.
ALTER TABLE "recurring_expenses" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "recurring_expenses" FROM anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'recurring_expenses'
      AND policyname = 'recurring_expenses_no_client_access'
  ) THEN
    CREATE POLICY recurring_expenses_no_client_access
      ON public.recurring_expenses
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;
