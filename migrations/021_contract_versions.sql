-- 021: Версионирование контрактов
-- Добавляем version + parent_version_id (отдельно от parent_contract_id, который
-- используется для аддендумов с change_kind/change_payload). Версии — это
-- "переподписание" того же договора с новыми условиями: предок переходит в
-- ARCHIVED, новая запись получает version = parent.version + 1.

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS parent_version_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_parent_version_fkey'
  ) THEN
    ALTER TABLE contracts
      ADD CONSTRAINT contracts_parent_version_fkey
      FOREIGN KEY (parent_version_id) REFERENCES contracts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS contracts_parent_version_id_idx ON contracts(parent_version_id);
