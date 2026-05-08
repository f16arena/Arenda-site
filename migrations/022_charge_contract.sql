-- 022: Связь charges → contracts
-- Опциональная привязка начисления к активному контракту арендатора, чтобы
-- группировать историю начислений по договорам. Существующие charges
-- остаются с contract_id = NULL (исторические — backfill не выполняем).

ALTER TABLE charges ADD COLUMN IF NOT EXISTS contract_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'charges_contract_fkey'
  ) THEN
    ALTER TABLE charges
      ADD CONSTRAINT charges_contract_fkey
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS charges_contract_id_idx ON charges(contract_id);
