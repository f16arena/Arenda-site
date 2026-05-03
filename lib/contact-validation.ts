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
