// Индивидуальные условия договора на размещение (оборудование / территория),
// которые влияют на начисления: эксплуатационные расходы по своей ставке за м²
// Места (круглый год, без зимней) и свой тариф на электроэнергию. Ставки здания
// для таких арендаторов не подходят: у Места нет площади помещения, а тариф
// здания общий для всех. Чистый модуль — читает только builderState договора.

type PlacementLike = {
  family?: string
  placeAreaSqm?: number
  serviceFeePerSqm?: number
  electricityTariff?: number
  electricity?: string
}

function placementOf(builderState: unknown): PlacementLike | null {
  const p = (builderState as { placement?: PlacementLike } | null)?.placement
  return p && (p.family === "equipment" || p.family === "territory") ? p : null
}

/** Доля месяца внутри срока договора (0..1): первый и последний месяцы — по дням. */
function periodShare(period: string, start: Date | null, end: Date | null): number {
  const [y, m] = period.split("-").map(Number)
  const days = new Date(y, m, 0).getDate()
  const from = new Date(y, m - 1, 1)
  const to = new Date(y, m - 1, days)
  const a = start && start > from ? start : from
  const b = end && end < to ? end : to
  if (b < a) return 0
  const covered = Math.floor((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000) + 1
  return Math.min(1, covered / days)
}

export interface PlacementServiceFee {
  rate: number
  area: number
  amount: number
  description: string
}

/**
 * Эксплуатационные расходы по договору на размещение за период, или null, если
 * договор не на размещение / ставка не задана. `null` означает «считай как
 * раньше» (по ставке здания), а не «ноль».
 */
export function placementServiceFeeForPeriod(
  builderState: unknown,
  period: string,
  contractStart: Date | null,
  contractEnd: Date | null,
): PlacementServiceFee | null {
  const p = placementOf(builderState)
  const rate = p?.serviceFeePerSqm ?? 0
  const area = p?.placeAreaSqm ?? 0
  if (!p || rate <= 0 || area <= 0) return null
  const share = periodShare(period, contractStart, contractEnd)
  const amount = Math.round(rate * area * share)
  const part = share < 1 ? ` (${Math.round(share * 100)}% месяца)` : ""
  return { rate, area, amount, description: `Эксплуатационные расходы за ${period}: ${area} м² × ${rate} ₸${part}` }
}

/** Договор на размещение (эксплуатационные расходы ведёт сам договор, а не здание). */
export function isPlacementContract(builderState: unknown): boolean {
  return placementOf(builderState) !== null
}

/** Индивидуальный тариф на электроэнергию по договору (₸/кВт·ч) или null. */
export function placementElectricityTariff(builderState: unknown): number | null {
  const p = placementOf(builderState)
  const t = p?.electricityTariff ?? 0
  return p && p.electricity === "meter" && t > 0 ? t : null
}
