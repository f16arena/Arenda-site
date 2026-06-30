-- Исходное состояние конструктора (InvoiceState/AvrState/ReconciliationState) для
-- сгенерированных документов. Нужно, чтобы при скачивании ПОДПИСАННОГО счёта/АВР/сверки
-- пересобрать файл с QR-кодом и штампами ЭЦП (как у договора через builderState).
-- Идемпотентно. Пусто/NULL — старые документы (пересборка недоступна, отдаём как есть).
ALTER TABLE generated_document ADD COLUMN IF NOT EXISTS source_state jsonb;
