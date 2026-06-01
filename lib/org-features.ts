// Org-level флаги, которые владелец переключает сам (в отличие от plan.features,
// которыми управляет суперадмин). Хранятся в Organization.features (JSON-строка).

export interface OrgFeatures {
  /** Скрыть раздел «Дополнительные начисления» (ручные начисления свет/вода/услуги)
   *  в карточке арендатора — например, когда всё покрыто эксплуатационными расходами. */
  additionalChargesDisabled?: boolean
  /** Ставка налога с оборота для отчёта владельца, %. По новому НК РК (с 2026)
   *  упрощёнка = 4%, маслихат корректирует ±50% (2–6%). Дефолт 4. */
  taxRatePercent?: number
  /** Метка налогового режима (для подписи в отчёте). Свободный текст/пресет. */
  taxRegime?: string
}

/** Налоговый режим по умолчанию — упрощёнка по новому НК РК с 2026. */
export const DEFAULT_TAX_RATE_PERCENT = 4

/** Эффективная ставка налога с оборота, % (clamp 0–20). */
export function getTaxRatePercent(featuresJson: string | null | undefined): number {
  const v = parseOrgFeatures(featuresJson).taxRatePercent
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_TAX_RATE_PERCENT
  return Math.min(Math.max(v, 0), 20)
}

export function getTaxRegime(featuresJson: string | null | undefined): string {
  return parseOrgFeatures(featuresJson).taxRegime?.trim() || "Упрощёнка (СНР)"
}

export function parseOrgFeatures(json: string | null | undefined): OrgFeatures {
  if (!json) return {}
  try {
    const v = JSON.parse(json)
    return v && typeof v === "object" ? (v as OrgFeatures) : {}
  } catch {
    return {}
  }
}

/** «Дополнительные начисления» включены, если флаг не выставлен в disabled. */
export function additionalChargesEnabled(featuresJson: string | null | undefined): boolean {
  return parseOrgFeatures(featuresJson).additionalChargesDisabled !== true
}
