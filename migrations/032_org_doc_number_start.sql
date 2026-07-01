-- Стартовый номер документов по типам { "ACT": 58, "INVOICE": 28 } — чтобы
-- продолжить нумерацию из прежней системы (1С) при переходе на Commrent в середине
-- года. nextDocumentNumber использует это как нижнюю границу. Идемпотентно.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS doc_number_start jsonb;
