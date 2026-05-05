ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "parent_contract_id" TEXT;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "change_kind" TEXT;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "change_payload" JSONB;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "effective_date" TIMESTAMP(3);
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "applied_at" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contracts_parent_contract_id_fkey'
  ) THEN
    ALTER TABLE "contracts"
      ADD CONSTRAINT "contracts_parent_contract_id_fkey"
      FOREIGN KEY ("parent_contract_id")
      REFERENCES "contracts"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "contracts_tenant_id_type_status_created_at_idx"
  ON "contracts"("tenant_id", "type", "status", "created_at");

CREATE INDEX IF NOT EXISTS "contracts_parent_contract_id_idx"
  ON "contracts"("parent_contract_id");

CREATE INDEX IF NOT EXISTS "contracts_change_kind_applied_at_idx"
  ON "contracts"("change_kind", "applied_at");
