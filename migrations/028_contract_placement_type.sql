-- Тип договора по предмету аренды (помещение/крыша/территория/…). Идемпотентно.
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS placement_type text;
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS placement_type text;
