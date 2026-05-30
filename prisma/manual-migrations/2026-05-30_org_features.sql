-- Миграция 2026-05-30: org-level флаги организации (JSON)
-- Применять в Supabase SQL Editor. Идемпотентно.
--
-- features — JSON-строка с настройками, переключаемыми владельцем
-- (в отличие от plans.features, которыми управляет суперадмин).
-- Напр. {"additionalChargesDisabled": true} — скрыть раздел «Дополнительные начисления».

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS features TEXT NOT NULL DEFAULT '{}';
