export const DEFAULT_KZ_VAT_RATE = 16

export const KZ_VAT_RATE_VALUES = [16, 10, 5, 0] as const

export type KzVatRate = (typeof KZ_VAT_RATE_VALUES)[number]

export const KZ_VAT_RATE_OPTIONS: Array<{ value: KzVatRate; label: string; hint: string }> = [
  { value: 16, label: "16% — основная ставка НДС", hint: "Стандартная ставка по НК РК с 2026 года" },
  { value: 10, label: "10% — специальная ставка НДС", hint: "Только для случаев, предусмотренных НК РК" },
  { value: 5, label: "5% — специальная ставка НДС", hint: "Только для случаев, предусмотренных НК РК" },
  { value: 0, label: "0% — нулевая ставка НДС", hint: "Только для операций, облагаемых по нулевой ставке" },
]

export function isKzVatRate(value: unknown): value is KzVatRate {
  return KZ_VAT_RATE_VALUES.includes(value as KzVatRate)
}

export function normalizeKzVatRate(
  value: FormDataEntryValue | string | number | null | undefined,
  fallback: KzVatRate = DEFAULT_KZ_VAT_RATE,
) {
  const raw = String(value ?? "").trim().replace(",", ".")
  if (!raw) return fallback
  const rate = Number(raw)
  if (isKzVatRate(rate)) return rate
  throw new Error("Ставка НДС должна быть одной из разрешённых НК РК: 0%, 5%, 10% или 16%")
}

export function coerceKzVatRate(value: unknown, fallback: KzVatRate = DEFAULT_KZ_VAT_RATE) {
  try {
    return normalizeKzVatRate(value as FormDataEntryValue | string | number | null | undefined, fallback)
  } catch {
    return fallback
  }
}
