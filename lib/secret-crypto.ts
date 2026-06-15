import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto"

// Универсальное шифрование секретов в состоянии покоя (AES-256-GCM).
// Тот же подход и ключ, что у lib/totp-secret: ключ из SECRET_ENC_KEY, иначе из
// AUTH_SECRET/NEXTAUTH_SECRET. Используется для реквизитов интеграций (ЭСФ:
// пароль учётки, PIN контейнера) — чтобы дамп БД не раскрывал секреты.
//
// Формат: "v1." + base64(iv[12] || tag[16] || ciphertext). Префикс "v1." не
// пересекается с обычными строками — decrypt вернёт legacy-значение как есть.

const PREFIX = "v1."
const SALT = "commrent.secret.v1"

let cachedKey: Buffer | null = null

function getKey(): Buffer | null {
  if (cachedKey) return cachedKey
  const material = process.env.SECRET_ENC_KEY || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!material) return null
  cachedKey = scryptSync(material, SALT, 32)
  return cachedKey
}

export function isEncryptedSecret(stored: string): boolean {
  return stored.startsWith(PREFIX)
}

export function encryptSecret(plain: string): string {
  if (!plain) return plain
  const key = getKey()
  if (!key) return plain
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64")
}

export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return ""
  if (!isEncryptedSecret(stored)) return stored // legacy/plaintext
  const key = getKey()
  if (!key) throw new Error("SECRET_ENC_KEY/AUTH_SECRET не настроен — нечем расшифровать секрет")
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64")
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const ct = raw.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8")
}
