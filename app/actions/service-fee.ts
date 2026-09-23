"use server"

// ВАЖНО: файл с "use server" может экспортировать только async-функции.
// Sync-хелпер resolveServiceFeeSettings вынесен в lib/service-fee-settings.ts.

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { getT } from "@/lib/i18n/server"

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
  const { t } = await getT()

  // Валидация.
  if (input.winterRate !== null && (!Number.isFinite(input.winterRate) || input.winterRate < 0)) {
    return { ok: false, error: t("actions.serviceFee.invalidWinterRate") }
  }
  if (input.summerRate !== null && (!Number.isFinite(input.summerRate) || input.summerRate < 0)) {
    return { ok: false, error: t("actions.serviceFee.invalidSummerRate") }
  }
  if (input.indexationPct < 0 || input.indexationPct > 100) {
    return { ok: false, error: t("actions.serviceFee.invalidIndexationPct") }
  }
  // Зимние месяцы — уникальный список чисел 1..12.
  const months = Array.from(new Set(input.winterMonths))
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
    .sort((a, b) => a - b)
  if (months.length === 0) {
    return { ok: false, error: t("actions.serviceFee.winterMonthsRequired") }
  }
  if (months.length === 12) {
    return { ok: false, error: t("actions.serviceFee.winterMonthsAllYear") }
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

