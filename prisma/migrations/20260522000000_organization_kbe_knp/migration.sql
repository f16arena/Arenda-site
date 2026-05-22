-- КБе (код бенефициара) и КНП (код назначения платежа) в реквизитах организации.
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "kbe" TEXT,
  ADD COLUMN IF NOT EXISTS "knp" TEXT;
