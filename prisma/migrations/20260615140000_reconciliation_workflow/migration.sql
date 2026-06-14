-- Сверка взаиморасчётов: статус подтверждения контрагентом для актов сверки
-- (documentType = RECONCILIATION). SENT → AGREED | DISPUTED.

ALTER TABLE "generated_documents" ADD COLUMN IF NOT EXISTS "recon_status" TEXT;
ALTER TABLE "generated_documents" ADD COLUMN IF NOT EXISTS "recon_responded_at" TIMESTAMP(3);
ALTER TABLE "generated_documents" ADD COLUMN IF NOT EXISTS "recon_response_note" TEXT;
