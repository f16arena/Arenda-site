import { resolve4, resolve6, resolveMx } from "node:dns/promises"

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

type NormalizeOptions = {
  required?: boolean
  fieldName?: string
}

type PhoneOptions = NormalizeOptions & {
  allowShort?: boolean
}

export function normalizeEmail(value: FormDataEntryValue | string | null | undefined, options: NormalizeOptions & { required: true }): string
export function normalizeEmail(value: FormDataEntryValue | string | null | undefined, options?: NormalizeOptions): string | null
export function normalizeEmail(value: FormDataEntryValue | string | null | undefined, options: NormalizeOptions = {}) {
  const fieldName = options.fieldName ?? "Email"
  const email = String(value ?? "").trim().toLowerCase()

  if (!email) {
    if (options.required) throw new Error(`Введите ${fieldName.toLowerCase()}`)
    return null
  }

  if (
    email.length > 254 ||
    email.includes("..") ||
    !EMAIL_RE.test(email)
  ) {
    throw new Error(`${fieldName}: введите корректный email`)
  }

  return email
}

export async function normalizeEmailWithDns(value: FormDataEntryValue | string | null | undefined, options: NormalizeOptions & { required: true }): Promise<string>
export async function normalizeEmailWithDns(value: FormDataEntryValue | string | null | undefined, options?: NormalizeOptions): Promise<string | null>
export async function normalizeEmailWithDns(value: FormDataEntryValue | string | null | undefined, options: NormalizeOptions = {}) {
  const email = normalizeEmail(value, options)
  if (!email) return null

  const domain = email.split("@")[1]
  if (!domain) throw new Error(`${options.fieldName ?? "Email"}: укажите домен после @`)

  const exists = await emailDomainExists(domain)
  if (!exists) {
    throw new Error(`${options.fieldName ?? "Email"}: домен ${domain} не найден или не принимает почту`)
  }

  return email
}

export function normalizeKzPhone(value: FormDataEntryValue | string | null | undefined, options: PhoneOptions & { required: true }): string
export function normalizeKzPhone(value: FormDataEntryValue | string | null | undefined, options?: PhoneOptions): string | null
export function normalizeKzPhone(value: FormDataEntryValue | string | null | undefined, options: PhoneOptions = {}) {
  const fieldName = options.fieldName ?? "Телефон"
  const raw = String(value ?? "").trim()

  if (!raw) {
    if (options.required) throw new Error(`Введите ${fieldName.toLowerCase()}`)
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
    throw new Error(`${fieldName}: введите номер Казахстана в формате +7 7XX XXX XX XX`)
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
