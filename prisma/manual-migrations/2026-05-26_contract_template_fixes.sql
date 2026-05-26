-- Миграция 2026-05-26: исправления генератора договора (аудит шаблона)
-- Применять в Supabase SQL Editor (Database → SQL Editor → New query)
-- ВСЕ ALTER идемпотентны (IF NOT EXISTS), безопасно гонять несколько раз.

-- ============================================================
-- 1. Organization: дефолт пени для всех договоров организации
-- ============================================================
-- Если у конкретного tenant.penalty_percent = 0 — используется это значение.
-- 0.5 — стандартная зеркальная пеня в РК (см. аудит #12-13).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_penalty_percent DOUBLE PRECISION NOT NULL DEFAULT 0.5;

-- ============================================================
-- 2. Building: адрес для документов
-- ============================================================
-- Адрес из автокомплита (Photon/Nominatim) часто на казахском
-- («Шығыс Қазақстан облысы»). В договоры нужно по-русски — это поле
-- хранит русский вариант, перекрывая обычный `address` только для документов.
-- Если NULL — в документах используется обычный `address`.
ALTER TABLE buildings
  ADD COLUMN IF NOT EXISTS document_address TEXT;

-- ============================================================
-- 3. Tenant: документ-основание + пеня дефолт
-- ============================================================
-- basis_document — явный документ-основание для подписи арендатора.
-- Для ИП: «Уведомления №KZ16UWQ03665823 от 01.07.2022 г.»
-- Для ТОО: автоматически «Устава» если пусто.
-- Если NULL — fallback по legal_type без БИН (см. inferTenantBasis).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS basis_document TEXT;

-- penalty_percent: меняем дефолт с 1 на 0.5 (1% было слишком жёстко).
ALTER TABLE tenants
  ALTER COLUMN penalty_percent SET DEFAULT 0.5;

-- Существующие записи с penalty_percent === 1 (старый дефолт) → 0.5.
-- Если кто-то явно поставил себе 1% — это перепишется, но в реальности
-- ни один владелец вручную не выставлял именно 1 (это был дефолт).
UPDATE tenants SET penalty_percent = 0.5 WHERE penalty_percent = 1;

-- ============================================================
-- Проверка результата
-- ============================================================
-- SELECT default_penalty_percent FROM organizations LIMIT 5;
-- SELECT document_address FROM buildings LIMIT 5;
-- SELECT basis_document, penalty_percent FROM tenants LIMIT 5;
