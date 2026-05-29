-- Миграция 2026-05-30: снимок ContractState из конструктора на договоре.
-- Нужен, чтобы после подписания перерисовать итоговый DOCX с QR-кодом /verify/{id}.
-- Применять в Supabase SQL Editor. Идемпотентно.

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS builder_state JSONB;
