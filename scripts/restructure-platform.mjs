// scripts/restructure-platform.mjs
// Генерирует пароль для нового OWNER-а БЦ F16 и SQL для Supabase.
// Запуск: node scripts/restructure-platform.mjs
//
// Что делает SQL:
//   1) bolat_z@mail.ru → role=OWNER, новый пароль (захэширован)
//   2) organizations.slug='f16'.owner_user_id → id Болата
//   3) f16arena@gmail.com → organization_id=NULL, role=ADMIN, is_platform_owner=TRUE
//
// Идемпотентность: можно запустить повторно — Болат и f16arena найдутся по email.

import bcrypt from "bcryptjs"
import crypto from "node:crypto"

function generatePassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  let p = ""
  const buf = crypto.randomBytes(len)
  for (let i = 0; i < len; i++) p += chars[buf[i] % chars.length]
  return p
}

const NEW_OWNER_EMAIL = "bolat_z@mail.ru"
const PLATFORM_OWNER_EMAIL = "f16arena@gmail.com"
const ORG_SLUG = "f16"

const password = generatePassword(12)
const hash = await bcrypt.hash(password, 10)

const sql = `-- Migration 011: Реструктуризация (Variant A)
--   * Болат → OWNER БЦ F16 + новый пароль
--   * f16arena → чистый платформенный админ без организации
-- Сгенерировано: ${new Date().toISOString()}

BEGIN;

-- 1. Болат: повышение до OWNER + новый пароль.
-- bcrypt-хеш содержит '$' — заворачиваем в dollar-quoted string,
-- чтобы Supabase SQL Editor не принял его за параметр $1/$2/...
UPDATE users
SET role = 'OWNER',
    password = $hash$${hash}$hash$,
    is_active = TRUE,
    updated_at = NOW()
WHERE email = '${NEW_OWNER_EMAIL}';

-- 2. Привязать Болата как owner организации F16
UPDATE organizations
SET owner_user_id = (SELECT id FROM users WHERE email = '${NEW_OWNER_EMAIL}' LIMIT 1),
    updated_at = NOW()
WHERE slug = '${ORG_SLUG}';

-- 3. f16arena → чистый платформенный админ (без orgId)
UPDATE users
SET organization_id = NULL,
    role = 'ADMIN',
    is_platform_owner = TRUE,
    updated_at = NOW()
WHERE email = '${PLATFORM_OWNER_EMAIL}';

-- 4. Проверка результата
SELECT email, role, is_platform_owner, organization_id
FROM users
WHERE email IN ('${NEW_OWNER_EMAIL}', '${PLATFORM_OWNER_EMAIL}');

COMMIT;
`

console.log("\n══════════════════════════════════════════════════════")
console.log(" 🔐 НОВЫЙ ПАРОЛЬ ДЛЯ БОЛАТА (передай ему)")
console.log("══════════════════════════════════════════════════════")
console.log(`   Логин:  ${NEW_OWNER_EMAIL}`)
console.log(`   Пароль: ${password}`)
console.log("══════════════════════════════════════════════════════\n")

console.log("📋 SQL ДЛЯ КОПИРОВАНИЯ В Supabase → SQL Editor:")
console.log("──────────────────────────────────────────────────────")
console.log(sql)
console.log("──────────────────────────────────────────────────────")
console.log("\n✅ После выполнения SQL:")
console.log(`   • Болат заходит на /login: ${NEW_OWNER_EMAIL} / ${password}`)
console.log(`   • Ты (${PLATFORM_OWNER_EMAIL}) при логине попадаешь сразу на /superadmin`)
console.log(`   • F16 у тебя больше «не своя» — заходи через «Войти как клиент» из карточки орг\n`)
