-- Soft delete для критичных моделей: Tenant, Charge, Payment, Contract, GeneratedDocument
-- Позволяет восстановление данных при ошибочном удалении и сохраняет историю
-- финансовых транзакций для аудита.
--
-- Идемпотентно: IF NOT EXISTS на колонках и индексах.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS tenants_deleted_at_idx ON tenants (deleted_at);
CREATE INDEX IF NOT EXISTS charges_deleted_at_idx ON charges (deleted_at);
CREATE INDEX IF NOT EXISTS payments_deleted_at_idx ON payments (deleted_at);
CREATE INDEX IF NOT EXISTS contracts_deleted_at_idx ON contracts (deleted_at);
CREATE INDEX IF NOT EXISTS generated_documents_deleted_at_idx ON generated_documents (deleted_at);
