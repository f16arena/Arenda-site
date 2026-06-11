-- Связь документа с договором-источником + поля интеграции ИС ЭСФ
ALTER TABLE "generated_documents" ADD COLUMN "contract_id" TEXT;
ALTER TABLE "generated_documents" ADD COLUMN "esf_id" TEXT;
ALTER TABLE "generated_documents" ADD COLUMN "esf_reg_number" TEXT;
ALTER TABLE "generated_documents" ADD COLUMN "esf_status" TEXT;
ALTER TABLE "generated_documents" ADD COLUMN "esf_sent_at" TIMESTAMP(3);
ALTER TABLE "generated_documents" ADD COLUMN "esf_error" TEXT;
CREATE INDEX "generated_documents_contract_id_idx" ON "generated_documents"("contract_id");
