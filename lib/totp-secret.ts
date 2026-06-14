import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto"

// Шифрование TOTP-секрета в состоянии покоя (AES-256-GCM).
//
// Зачем: раньше секрет 2FA хранился в БД как открытый base32 — при утечке дампа
// все вторые факторы компрометируются. Теперь секрет шифруется перед записью и
// расшифровывается только в момент проверки кода.
//
// Ключ берём из TOTP_ENC_KEY, а если он не задан — из AUTH_SECRET/NEXTAUTH_SECRET
// (тот же источник, что и для impersonation в lib/org.ts). Это позволяет включить
// шифрование в проде без новой переменной окружения. AUTH_SECRET стабилен и не
// ротируется, поэтому уже зашифрованные секреты остаются читаемыми.
//
// Обратная совместимость: старые секреты лежат как plaintext base32 (алфавит
// A–Z, 2–7 — без строчных букв и точки), поэтому префикс "v1." гарантированно
// не пересекается с ними. decrypt возвращает legacy-секрет как есть; при первом
// успешном входе verifyTotpForLogin лениво перешифровывает его (см. two-factor.ts).

const PREFIX = "v1."
const SALT = "commrent.totp.v1"

let cachedKey: Buffer | null = null

function getKey(): Buffer | null {
  if (cachedKey) return cachedKey
  const material = process.env.TOTP_ENC_KEY || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!material) return null
  cachedKey = scryptSync(material, SALT, 32)
  return cachedKey
}

export function isEncryptedTotpSecret(stored: string): boolean {
  return stored.startsWith(PREFIX)
}

// Шифрует секрет перед записью. Если ключа нет (нештатно) — возвращает как есть,
// чтобы не сломать включение 2FA.
export function encryptTotpSecret(plain: string): string {
  const key = getKey()
  if (!key) return plain
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64")
}

// Расшифровывает секрет. Legacy plaintext (без префикса) возвращается как есть.
// Бросает, если ключ не настроен или данные повреждены/подделаны (GCM-тег).
export function decryptTotpSecret(stored: string): string {
  if (!isEncryptedTotpSecret(stored)) return stored
  const key = getKey()
  if (!key) throw new Error("TOTP encryption key is not configured")
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64")
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const ct = raw.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8")
}
