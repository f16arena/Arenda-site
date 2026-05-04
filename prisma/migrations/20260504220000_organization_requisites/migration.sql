ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS legal_type text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS bin text,
  ADD COLUMN IF NOT EXISTS iin text,
  ADD COLUMN IF NOT EXISTS director_name text,
  ADD COLUMN IF NOT EXISTS director_position text,
  ADD COLUMN IF NOT EXISTS basis text,
  ADD COLUMN IF NOT EXISTS legal_address text,
  ADD COLUMN IF NOT EXISTS actual_address text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS iik text,
  ADD COLUMN IF NOT EXISTS bik text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text;

UPDATE organizations
SET
  legal_name = COALESCE(legal_name, name),
  short_name = COALESCE(short_name, name)
WHERE legal_name IS NULL OR short_name IS NULL;
