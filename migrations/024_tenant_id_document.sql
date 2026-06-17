-- Удостоверение личности арендатора-физлица (legalType=PHYSICAL): нет БИН/устава,
-- основание в договоре — паспортные данные. Идемпотентно.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS id_doc_number   text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS id_doc_issued_by text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS id_doc_issued_at timestamp(3);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS id_doc_expires_at timestamp(3);
