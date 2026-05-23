"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { requireCapabilityAndFeature } from "@/lib/capabilities"

/**
 * Обновляет настройки эксплуатационного сбора на здании.
 * Сезонные тарифы (₸/м²/мес), список зимних месяцев (JSON-массив),
 * процент годовой индексации. См. лоr.s. документ «Приложение №3».
 */
export async function updateBuildingServiceFee(input: {
  buildingId: string
  winterRate: number | null
  summerRate: number | null
  winterMonths: number[]
  indexationPct: number
}): Promise<{ ok: boolean; error?: string }> {
  await requireCapabilityAndFeature("buildings.edit")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(input.buildingId, orgId)

  // Валидация.
  if (input.winterRate !== null && (!Number.isFinite(input.winterRate) || input.winterRate < 0)) {
    return { ok: false, error: "Зимний тариф должен быть ≥ 0" }
  }
  if (input.summerRate !== null && (!Number.isFinite(input.summerRate) || input.summerRate < 0)) {
    return { ok: false, error: "Летний тариф должен быть ≥ 0" }
  }
  if (input.indexationPct < 0 || input.indexationPct > 100) {
    return { ok: false, error: "Процент индексации должен быть от 0 до 100" }
  }
  // Зимние месяцы — уникальный список чисел 1..12.
  const months = Array.from(new Set(input.winterMonths))
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
    .sort((a, b) => a - b)
  if (months.length === 0) {
    return { ok: false, error: "Выберите хотя бы один зимний месяц" }
  }
  if (months.length === 12) {
    return { ok: false, error: "Если зимний период круглогодичный — летний тариф не нужен" }
  }

  await db.building.update({
    where: { id: input.buildingId },
    data: {
      serviceFeeWinterRate: input.winterRate,
      serviceFeeSummerRate: input.summerRate,
      serviceFeeWinterMonths: JSON.stringify(months),
      serviceFeeIndexationPct: input.indexationPct,
    },
  })

  revalidatePath(`/admin/buildings`)
  revalidatePath(`/admin/buildings/${input.buildingId}`)
  return { ok: true }
}

/**
 * Возвращает эффективные параметры эксплуатационного сбора для здания
 * (с дефолтами там, где не задано). Используется и в UI, и в cron monthly-invoices.
 */
export function resolveServiceFeeSettings(building: {
  serviceFeeWinterRate: number | null
  serviceFeeSummerRate: number | null
  serviceFeeWinterMonths: string | null
  serviceFeeIndexationPct: number | null
}) {
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
