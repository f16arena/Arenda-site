/**
 * Sync-хелпер для распарсивания настроек эксплуатационного сбора здания.
 * Выделено в отдельный модуль (без "use server"), чтобы можно было
 * импортировать и из server actions, и из UI server components, и из cron.
 */

export type ServiceFeeBuildingFields = {
  serviceFeeWinterRate: number | null
  serviceFeeSummerRate: number | null
  serviceFeeWinterMonths: string | null
  serviceFeeIndexationPct: number | null
}

export function resolveServiceFeeSettings(building: ServiceFeeBuildingFields) {
  let winterMonths: number[] = [10, 11, 12, 1, 2, 3, 4]
  if (building.serviceFeeWinterMonths) {
    try {
      const parsed = JSON.parse(building.serviceFeeWinterMonths)
      if (Array.isArray(parsed) && parsed.every((m) => Number.isInteger(m) && m >= 1 && m <= 12)) {
        winterMonths = parsed
      }
    } catch { /* fallback to default */ }
  }
  return {
    winterRate: building.serviceFeeWinterRate,
    summerRate: building.serviceFeeSummerRate,
    winterMonths,
    indexationPct: building.serviceFeeIndexationPct ?? 10,
    enabled: building.serviceFeeWinterRate !== null && building.serviceFeeSummerRate !== null,
  }
}
