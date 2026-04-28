-- ============================================================
-- Migration 011: Реструктуризация платформенного админа (Variant A)
-- ============================================================
--   1) bolat_z@mail.ru:        ADMIN → OWNER + новый пароль
--   2) organizations(slug=f16).owner_user_id → id Болата
--   3) f16arena@gmail.com:     organization_id=NULL, role=ADMIN, is_platform_owner=TRUE
--
-- Сгенерировано: scripts/restructure-platform.mjs (29.04.2026)
-- Перегенерировать (новый пароль): node scripts/restructure-platform.mjs
-- ============================================================

BEGIN;

-- 1. Болат: повышение до OWNER + новый пароль.
-- bcrypt-хеш содержит '$' — заворачиваем в dollar-quoted string ($hash$...$hash$),
-- чтобы Supabase SQL Editor не принял его за параметр $1/$2/...
UPDATE users
SET role = 'OWNER',
    password = $hash$$2b$10$0ElrENFAGaYhMBhHYOGNGe3BKyxY8Pe4EDrr1UnEreus2FwaNKgnG$hash$,
    is_active = TRUE,
    updated_at = NOW()
WHERE email = 'bolat_z@mail.ru';

-- 2. Привязать Болата как owner организации F16
UPDATE organizations
SET owner_user_id = (SELECT id FROM users WHERE email = 'bolat_z@mail.ru' LIMIT 1),
    updated_at = NOW()
WHERE slug = 'f16';

-- 3. f16arena → чистый платформенный админ (без orgId)
UPDATE users
SET organization_id = NULL,
    role = 'ADMIN',
    is_platform_owner = TRUE,
    updated_at = NOW()
WHERE email = 'f16arena@gmail.com';

-- 4. Проверка
SELECT email, role, is_platform_owner, organization_id
FROM users
WHERE email IN ('bolat_z@mail.ru', 'f16arena@gmail.com');

COMMIT;
