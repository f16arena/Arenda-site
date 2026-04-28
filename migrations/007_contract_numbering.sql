-- ============================================================
-- Migration 007: Авто-нумерация договоров по зданиям
-- ============================================================

-- Префикс для номера договора (например F16, PLZ) и счётчик
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS contract_prefix TEXT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS contract_counter INTEGER NOT NULL DEFAULT 0;

-- Дефолтный префикс для F16 Arena
UPDATE buildings SET contract_prefix = 'F16'
WHERE contract_prefix IS NULL AND name ILIKE '%F16%';
