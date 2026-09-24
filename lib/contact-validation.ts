import { resolve4, resolve6, resolveMx } from "node:dns/promises"

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

/**
 * Ключи подписей в словаре (catalogs.contact.*). Сам модуль — чистая проверка,
 * языка пользователя он не знает: текст собирает переводчик вызывающей стороны.
 */
type ContactMessageKey =
  | "catalogs.contact.required"
  | "catalogs.contact.emailInvalid"
  | "catalogs.contact.emailNoDomain"
  | "catalogs.contact.emailDomainUnknown"
  | "catalogs.contact.phoneInvalid"

type FieldKey = "catalogs.contact.fields.email" | "catalogs.contact.fields.phone"

/**
 * Переводчик вызывающей стороны: сюда передают t из getT(). Тип ключа узкий, а
 * не string, — тогда t подходит без приведения (его ключ шире).
 */
export type ContactTranslate = (
  key: ContactMessageKey | FieldKey,
  vars?: Record<string, string | number>,
) => string

type NormalizeOptions = {
  required?: boolean
  /** Уже переведённое название поля («Email владельца»). */
  fieldName?: string
  /** Без него сообщение остаётся русским — см. fallbackMessage. */
  t?: ContactTranslate
}

type PhoneOptions = NormalizeOptions & {
  allowShort?: boolean
}

/**
 * Запасной русский текст для путей, куда переводчик ещё не проброшен. Тот же
 * приём, что в lib/kz-iin.ts: миграция вызывающих сторон идёт постепенно, и до
 * неё пользователь видит прежнее сообщение, а не ключ словаря.
 */
function fallbackMessage(key: ContactMessageKey, field: string, domain?: string): string {
  switch (key) {
    case "catalogs.contact.required":
      return `Введите ${field.toLowerCase()}`
    case "catalogs.contact.emailInvalid":
      return `${field}: введите корректный email`
    case "catalogs.contact.emailNoDomain":
      return `${field}: укажите домен после @`
    case "catalogs.contact.emailDomainUnknown":
      return `${field}: домен ${domain} не найден или не принимает почту`
    case "catalogs.contact.phoneInvalid":
      return `${field}: введите номер Казахстана в формате +7 7XX XXX XX XX`
  }
}

function contactError(
  options: NormalizeOptions,
  defaultField: FieldKey,
  defaultFieldRu: string,
  key: ContactMessageKey,
  domain?: string,
): Error {
  const field = options.fieldName ?? (options.t ? options.t(defaultField) : defaultFieldRu)
  return new Error(
    options.t
      ? options.t(key, { field, fieldLower: field.toLowerCase(), domain: domain ?? "" })
      : fallbackMessage(key, field, domain),
  )
}

const emailError = (options: NormalizeOptions, key: ContactMessageKey, domain?: string) =>
  contactError(options, "catalogs.contact.fields.email", "Email", key, domain)

export function normalizeEmail(value: FormDataEntryValue | string | null | undefined, options: NormalizeOptions & { required: true }): string
export function normalizeEmail(value: FormDataEntryValue | string | null | undefined, options?: NormalizeOptions): string | null
export function normalizeEmail(value: FormDataEntryValue | string | null | undefined, options: NormalizeOptions = {}) {
  const email = String(value ?? "").trim().toLowerCase()

  if (!email) {
    if (options.required) throw emailError(options, "catalogs.contact.required")
    return null
  }

  if (
    email.length > 254 ||
    email.includes("..") ||
    !EMAIL_RE.test(email)
  ) {
    throw emailError(options, "catalogs.contact.emailInvalid")
  }

  return email
}

export async function normalizeEmailWithDns(value: FormDataEntryValue | string | null | undefined, options: NormalizeOptions & { required: true }): Promise<string>
export async function normalizeEmailWithDns(value: FormDataEntryValue | string | null | undefined, options?: NormalizeOptions): Promise<string | null>
export async function normalizeEmailWithDns(value: FormDataEntryValue | string | null | undefined, options: NormalizeOptions = {}) {
  const email = normalizeEmail(value, options)
  if (!email) return null

  const domain = email.split("@")[1]
  if (!domain) throw emailError(options, "catalogs.contact.emailNoDomain")

  const exists = await emailDomainExists(domain)
  if (!exists) {
    throw emailError(options, "catalogs.contact.emailDomainUnknown", domain)
  }

  return email
}

export function normalizeKzPhone(value: FormDataEntryValue | string | null | undefined, options: PhoneOptions & { required: true }): string
export function normalizeKzPhone(value: FormDataEntryValue | string | null | undefined, options?: PhoneOptions): string | null
export function normalizeKzPhone(value: FormDataEntryValue | string | null | undefined, options: PhoneOptions = {}) {
  const phoneError = (key: ContactMessageKey) =>
    contactError(options, "catalogs.contact.fields.phone", "Телефон", key)
  const raw = String(value ?? "").trim()

  if (!raw) {
    if (options.required) throw phoneError("catalogs.contact.required")
    return null
  }

  const digits = raw.replace(/\D/g, "")

  if (options.allowShort && /^\d{2,6}$/.test(digits)) {
    return digits
  }

  let national = ""
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    national = digits.slice(1)
  } else if (digits.length === 10) {
    national = digits
  }

  if (!/^[67]\d{9}$/.test(national)) {
    throw phoneError("catalogs.contact.phoneInvalid")
  }

  return `+7${national}`
}

async function emailDomainExists(domain: string) {
  try {
    const mx = await resolveMx(domain)
    if (mx.length > 0) return true
  } catch (error) {
    if (isTransientDnsError(error)) return true
    if (!isMissingDnsRecord(error)) throw error
  }

  try {
    const addresses = await resolve4(domain)
    if (addresses.length > 0) return true
  } catch (error) {
    if (isTransientDnsError(error)) return true
    if (!isMissingDnsRecord(error)) throw error
  }

  try {
    const addresses = await resolve6(domain)
    return addresses.length > 0
  } catch (error) {
    if (isTransientDnsError(error)) return true
    if (!isMissingDnsRecord(error)) throw error
    return false
  }
}

function isMissingDnsRecord(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""
  return ["ENOTFOUND", "ENODATA", "ENODOMAIN", "NOTFOUND"].includes(code)
}

function isTransientDnsError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""
  return ["EAI_AGAIN", "ECONNREFUSED", "ETIMEOUT", "SERVFAIL"].includes(code)
}

export function getLoginIdentifiers(value: FormDataEntryValue | string | null | undefined) {
  const raw = String(value ?? "").trim()
  const identifiers = new Set<string>()
  if (!raw) return []

  identifiers.add(raw)
  identifiers.add(raw.toLowerCase())

  try {
    const email = normalizeEmail(raw)
    if (email) identifiers.add(email)
  } catch {}

  try {
    const phone = normalizeKzPhone(raw)
    if (phone) identifiers.add(phone)
  } catch {}

  return Array.from(identifiers)
}
