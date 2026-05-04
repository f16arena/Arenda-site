ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS second_bank_name text,
  ADD COLUMN IF NOT EXISTS second_iik text,
  ADD COLUMN IF NOT EXISTS second_bik text;
