-- Уникальный partial-индекс на charges(tenant_id, period, type) среди живых записей.
-- Защищает от race condition между cron monthly-invoices и ручной generateMonthlyCharges:
-- одновременный запуск мог создать 2 charges с одинаковыми (tenantId, period, type).
--
-- Partial WHERE deleted_at IS NULL: после soft-delete можно создать новый charge
-- с теми же ключами, не нарушая constraint.
--
-- Идемпотентно: дубликаты вычищаются один раз, индекс через IF NOT EXISTS.

-- Сначала удаляем существующие дубликаты среди живых записей (deleted_at IS NULL).
-- Оставляем самую старую по created_at (первая «настоящая»). Удаление физическое:
-- если бы делали soft-delete, дубликаты остались бы в системе как «зомби».
DELETE FROM charges a
USING charges b
WHERE a.tenant_id = b.tenant_id
  AND a.period = b.period
  AND a.type = b.type
  AND a.deleted_at IS NULL
  AND b.deleted_at IS NULL
  AND (a.created_at > b.created_at
       OR (a.created_at = b.created_at AND a.id > b.id));

CREATE UNIQUE INDEX IF NOT EXISTS charges_tenant_period_type_unique
  ON charges (tenant_id, period, type)
  WHERE deleted_at IS NULL;
