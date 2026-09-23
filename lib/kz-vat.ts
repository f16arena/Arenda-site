export const DEFAULT_KZ_VAT_RATE = 16

export const KZ_VAT_RATE_VALUES = [16, 10, 5, 0] as const

export type KzVatRate = (typeof KZ_VAT_RATE_VALUES)[number]

// Только сами ставки: подписи живут в словаре (common.settings.vat.rateOption),
// иначе список пришлось бы держать на каждом языке.
export const KZ_VAT_RATE_OPTIONS: Array<{ value: KzVatRate }> = [
  { value: 16 },
  { value: 10 },
  { value: 5 },
  { value: 0 },
]

export function isKzVatRate(value: unknown): value is KzVatRate {
  return KZ_VAT_RATE_VALUES.includes(value as KzVatRate)
}

export function normalizeKzVatRate(
  value: FormDataEntryValue | string | number | null | undefined,
  fallback: KzVatRate = DEFAULT_KZ_VAT_RATE,
  message?: string,
) {
  const raw = String(value ?? "").trim().replace(",", ".")
  if (!raw) return fallback
  const rate = Number(raw)
  if (isKzVatRate(rate)) return rate
  // Текст приходит от вызывающей стороны: здесь язык пользователя неизвестен.
  throw new Error(message ?? "Недопустимая ставка НДС")
}

export function coerceKzVatRate(value: unknown, fallback: KzVatRate = DEFAULT_KZ_VAT_RATE) {
  try {
    return normalizeKzVatRate(value as FormDataEntryValue | string | number | null | undefined, fallback)
  } catch {
    return fallback
  }
}
