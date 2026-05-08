-- 017_tenant_indexes.sql
-- Индексы на tenants для ускорения списка /admin/tenants:
-- ORDER BY created_at DESC использовался без индекса → seq scan на больших таблицах.
-- userId уже UNIQUE — индекс создаётся автоматически, поэтому не дублируем.
CREATE INDEX IF NOT EXISTS tenants_created_at_idx ON tenants (created_at DESC);
