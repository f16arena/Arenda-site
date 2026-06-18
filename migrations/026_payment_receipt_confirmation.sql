-- Подтверждение квитанции о приёме наличных администратором. Идемпотентно.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_confirmed_at timestamp(3);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_confirmed_by_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payments_receipt_confirmed_by_id_fkey'
      AND table_name = 'payments'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_receipt_confirmed_by_id_fkey
      FOREIGN KEY (receipt_confirmed_by_id) REFERENCES users(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
