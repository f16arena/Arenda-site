-- Деньги хранятся числом с плавающей точкой. Чтобы в базу не попадали
-- «хвосты» вида 1234.5678 (из-за них долг никогда не закрывается),
-- суммы проверяются на два знака. Приложение округляет через lib/money.ts.
-- Проверка не блокирует существующие строки: NOT VALID, все текущие данные
-- уже корректны (проверено 20.09.2026).

ALTER TABLE "charges" DROP CONSTRAINT IF EXISTS "charges_amount_2dp";
ALTER TABLE "charges" ADD CONSTRAINT "charges_amount_2dp"
  CHECK ("amount" = round("amount"::numeric, 2)::double precision) NOT VALID;

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_amount_2dp";
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_2dp"
  CHECK ("amount" = round("amount"::numeric, 2)::double precision
     AND "unapplied_amount" = round("unapplied_amount"::numeric, 2)::double precision) NOT VALID;

ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_amount_2dp";
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_2dp"
  CHECK ("amount" = round("amount"::numeric, 2)::double precision) NOT VALID;

ALTER TABLE "cash_transactions" DROP CONSTRAINT IF EXISTS "cash_transactions_amount_2dp";
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_amount_2dp"
  CHECK ("amount" = round("amount"::numeric, 2)::double precision) NOT VALID;

ALTER TABLE "cash_accounts" DROP CONSTRAINT IF EXISTS "cash_accounts_balance_2dp";
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_balance_2dp"
  CHECK ("balance" = round("balance"::numeric, 2)::double precision) NOT VALID;

ALTER TABLE "debt_installments" DROP CONSTRAINT IF EXISTS "debt_installments_amount_2dp";
ALTER TABLE "debt_installments" ADD CONSTRAINT "debt_installments_amount_2dp"
  CHECK ("amount" = round("amount"::numeric, 2)::double precision) NOT VALID;

-- Суммы не бывают отрицательными (кроме движения по кассе: там минус = расход).
ALTER TABLE "charges" DROP CONSTRAINT IF EXISTS "charges_amount_nonneg";
ALTER TABLE "charges" ADD CONSTRAINT "charges_amount_nonneg" CHECK ("amount" >= 0) NOT VALID;
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_amount_positive";
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0) NOT VALID;
