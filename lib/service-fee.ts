/**
 * Расчёт эксплуатационного сбора арендатора за период.
 * Применяется сезонная ставка здания × общая арендуемая площадь.
 * Первый месяц после contractStart — про-рейт по дням.
 *
 * Логика:
 *   - месяц периода ∈ winterMonths → берём winterRate
 *   - иначе → summerRate
 *   - если tenant.contractStart внутри этого периода — про-рейт за дни (контрактStart..конец месяца)
 *   - если tenant.contractEnd внутри этого периода — про-рейт за дни (начало месяца..contractEnd)
 *   - иначе — полный месяц
 */
import { resolveServiceFeeSettings } from "@/lib/service-fee-settings"

export type TenantForServiceFee = {
  id: string
  contractStart: Date | string | null
  contractEnd: Date | string | null
  space: { area: number | null; floor: { buildingId: string } } | null
  tenantSpaces: Array<{ space: { area: number | null; floor: { buildingId: string } } }>
  fullFloors: Array<{ totalArea: number | null; buildingId: string }>
}

export type BuildingForServiceFee = {
  id: string
  serviceFeeWinterRate: number | null
  serviceFeeSummerRate: number | null
  serviceFeeWinterMonths: string | null
  serviceFeeIndexationPct: number | null
}

export type ServiceFeeResult = {
  shouldCreate: boolean
  buildingId: string | null
  amount: number
  area: number
  rate: number
  isWinter: boolean
  isProrated: boolean
  daysCovered: number
  daysInMonth: number
  dueDate: Date
  description: string
  skippedReason?: "NO_AREA" | "NO_RATE" | "NO_BUILDING" | "OUT_OF_RANGE"
}

/**
 * Определяет здание арендатора — берём первое из доступных источников.
 * Если арендатор «растянут» на несколько зданий — берём то, где находится первая
 * найденная площадь (в реальной жизни это редкая ситуация).
 */
export function getTenantBuildingId(tenant: Pick<TenantForServiceFee, "space" | "tenantSpaces" | "fullFloors">): string | null {
  if (tenant.space?.floor?.buildingId) return tenant.space.floor.buildingId
  if (tenant.tenantSpaces.length > 0) return tenant.tenantSpaces[0].space.floor.buildingId
  if (tenant.fullFloors.length > 0) return tenant.fullFloors[0].buildingId
  return null
}

/**
 * Считает общую арендуемую площадь = space + tenantSpaces + fullFloors.
 * Только из помещений/этажей того же здания, что вернёт getTenantBuildingId.
 */
export function getTenantArea(tenant: Pick<TenantForServiceFee, "space" | "tenantSpaces" | "fullFloors">, buildingId: string): number {
  let total = 0
  if (tenant.space?.floor.buildingId === buildingId && tenant.space.area) {
    total += tenant.space.area
  }
  for (const ts of tenant.tenantSpaces) {
    if (ts.space.floor.buildingId === buildingId && ts.space.area) {
      total += ts.space.area
    }
  }
  for (const ff of tenant.fullFloors) {
    if (ff.buildingId === buildingId && ff.totalArea) {
      total += ff.totalArea
    }
  }
  return total
}

/**
 * Подсчёт сезонного эксплуатационного сбора для арендатора за один период (YYYY-MM).
 * Возвращает shouldCreate=false с skippedReason если данных недостаточно.
 */
export function calculateServiceFeeForPeriod(
  tenant: TenantForServiceFee,
  building: BuildingForServiceFee,
  period: string,
  paymentDueDay = 10,
): ServiceFeeResult {
  const [yearStr, monthStr] = period.split("-")
  const year = Number(yearStr)
  const monthNum = Number(monthStr) // 1..12
  const daysInMonth = new Date(year, monthNum, 0).getDate()
  const periodStart = new Date(year, monthNum - 1, 1)
  const periodEnd = new Date(year, monthNum - 1, daysInMonth)
  const dueDate = new Date(year, monthNum - 1, Math.min(paymentDueDay, daysInMonth))

  const settings = resolveServiceFeeSettings(building)
  const isWinter = settings.winterMonths.includes(monthNum)
  const rate = isWinter ? settings.winterRate : settings.summerRate

  const buildingId = getTenantBuildingId(tenant)
  if (!buildingId) {
    return makeSkipped(buildingId, dueDate, "NO_BUILDING")
  }
  const area = getTenantArea(tenant, buildingId)
  if (area <= 0) {
    return makeSkipped(buildingId, dueDate, "NO_AREA")
  }
  if (rate === null || rate <= 0) {
    return makeSkipped(buildingId, dueDate, "NO_RATE")
  }

  // Пересечение периода с диапазоном контракта.
  const contractStart = tenant.contractStart ? new Date(tenant.contractStart) : null
  const contractEnd = tenant.contractEnd ? new Date(tenant.contractEnd) : null

  let effectiveStart = periodStart
  let effectiveEnd = periodEnd

  if (contractStart && contractStart > periodEnd) {
    return makeSkipped(buildingId, dueDate, "OUT_OF_RANGE")
  }
  if (contractEnd && contractEnd < periodStart) {
    return makeSkipped(buildingId, dueDate, "OUT_OF_RANGE")
  }
  if (contractStart && contractStart > periodStart) effectiveStart = contractStart
  if (contractEnd && contractEnd < periodEnd) effectiveEnd = contractEnd

  // Кол-во дней, за которые надо начислить (включая обе границы).
  const msPerDay = 24 * 60 * 60 * 1000
  const daysCovered = Math.round(
    (effectiveEnd.getTime() - effectiveStart.getTime()) / msPerDay,
  ) + 1
  const isProrated = daysCovered !== daysInMonth

  const fullMonthAmount = area * rate
  const amount = isProrated
    ? Math.round((fullMonthAmount * daysCovered) / daysInMonth)
    : Math.round(fullMonthAmount)

  const monthLabel = MONTH_LABEL_RU[monthNum - 1] ?? period
  const proratedSuffix = isProrated ? ` (${daysCovered} дн. из ${daysInMonth})` : ""
  const description = `Эксплуатационный сбор за ${monthLabel} ${year}: ${area} м² × ${rate} ₸${proratedSuffix}`

  return {
    shouldCreate: true,
    buildingId,
    amount,
    area,
    rate,
    isWinter,
    isProrated,
    daysCovered,
    daysInMonth,
    dueDate,
    description,
  }
}

function makeSkipped(buildingId: string | null, dueDate: Date, reason: ServiceFeeResult["skippedReason"]): ServiceFeeResult {
  return {
    shouldCreate: false,
    buildingId,
    amount: 0,
    area: 0,
    rate: 0,
    isWinter: false,
    isProrated: false,
    daysCovered: 0,
    daysInMonth: 0,
    dueDate,
    description: "",
    skippedReason: reason,
  }
}

const MONTH_LABEL_RU = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
]

/**
 * Локализованный текст «С октября по апрель включительно» из списка месяцев.
 * Используется в placeholder {service_fee_winter_months} / {service_fee_summer_months}.
 */
export function formatMonthsRangeLabel(months: number[]): string {
  if (months.length === 0) return "—"
  // Найти непрерывные диапазоны (handle wrap year-over).
  const sorted = [...months].sort((a, b) => a - b)
  // Если все 12 — «круглый год».
  if (sorted.length === 12) return "круглогодично"

  // Найти зиму как непрерывную последовательность с переходом через декабрь.
  // Простой подход: если в списке есть и янв, и дек — берём непрерывный кусок,
  // начиная с первого месяца после «разрыва».
  const isInList = (m: number) => sorted.includes(m)
  let startMonth = sorted[0]
  let endMonth = sorted[sorted.length - 1]
  // Если есть и янв и дек (типичная зима окт-апр) — найти разрыв.
  if (isInList(1) && isInList(12)) {
    for (let m = 1; m <= 12; m++) {
      if (!isInList(m)) {
        // Разрыв после месяца (m-1). Старт — следующий после разрыва месяц.
        // Чтобы найти корректно — пройти по кругу, начиная с m+1 пока есть месяцы.
        let i = m + 1
        while (i <= 12 && !isInList(i)) i++
        if (i > 12) i = 1
        startMonth = i
        // End — предыдущий месяц от текущего разрыва.
        endMonth = m === 1 ? 12 : m - 1
        // Но т.к. есть и янв и дек, ищем правильно: end = последний месяц
        // до разрыва, идя через декабрь к январю и далее.
        // Простой случай: дефолт [10,11,12,1,2,3,4] → разрыв на 5..9.
        // startMonth = 10, endMonth = 4 — корректно.
        break
      }
    }
  }
  return `С ${MONTH_LABEL_RU[startMonth - 1]} по ${MONTH_LABEL_RU[endMonth - 1]} включительно`
}
