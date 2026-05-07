-- Migration 016 — внешний идентификатор платежа для идемпотентности
--
-- Добавляет поле external_ref для дедупликации webhook'ов от Kaspi и повторных
-- импортов банковской выписки. UNIQUE-constraint гарантирует что один и тот же
-- внешний txnId не создаст две записи Payment.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS external_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS payments_external_ref_key
  ON payments(external_ref)
  WHERE external_ref IS NOT NULL;
