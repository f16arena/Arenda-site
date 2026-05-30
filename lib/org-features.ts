// Org-level флаги, которые владелец переключает сам (в отличие от plan.features,
// которыми управляет суперадмин). Хранятся в Organization.features (JSON-строка).

export interface OrgFeatures {
  /** Скрыть раздел «Дополнительные начисления» (ручные начисления свет/вода/услуги)
   *  в карточке арендатора — например, когда всё покрыто эксплуатационными расходами. */
  additionalChargesDisabled?: boolean
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
