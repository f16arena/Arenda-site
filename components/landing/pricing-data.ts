import "server-only"
import { db } from "@/lib/db"
import { calculatePrice, type PriceBreakdown } from "@/lib/pricing"

export type PricingPlan = {
  code: string
  name: string
  description: string | null
  maxBuildings: number | null
  maxTenants: number | null
  maxUsers: number | null
  maxStorageGb: number | null
  highlights: string[]
}
export type PricingPeriod = { code: string; name: string; monthsCount: number; discountPct: number; bonusMessage: string | null }
export type PricingMatrixCell = { normal: PriceBreakdown; founders: PriceBreakdown } | null
export type PricingMatrix = Record<string, Record<string, PricingMatrixCell>>

/**
 * Серверная подготовка матрицы цен 5 тарифов × 5 периодов с парой
 * (обычная цена / Founders-цена) для каждой клетки. Используется лендингом.
 */
export async function getPricingData(): Promise<{ plans: PricingPlan[]; periods: PricingPeriod[]; matrix: PricingMatrix }> {
  const [plansRaw, periods] = await Promise.all([
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.billingPeriod.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ])

  const plans: PricingPlan[] = plansRaw.map((p) => {
    let highlights: string[] = []
    try {
      const f = JSON.parse(p.features ?? "{}") as { highlights?: string[] }
      if (Array.isArray(f.highlights)) highlights = f.highlights.slice(0, 8)
    } catch { /* ignore */ }
    return {
      code: p.code,
      name: p.name,
      description: p.description,
      maxBuildings: p.maxBuildings,
      maxTenants: p.maxTenants,
      maxUsers: p.maxUsers,
      maxStorageGb: p.maxStorageGb,
      highlights,
    }
  })

  const matrix: PricingMatrix = {}
  for (const plan of plans) {
    matrix[plan.code] = {}
    for (const period of periods) {
      try {
        const [normal, founders] = await Promise.all([
          calculatePrice({ planCode: plan.code, billingPeriodCode: period.code, isFoundersMember: false }),
          calculatePrice({ planCode: plan.code, billingPeriodCode: period.code, isFoundersMember: true, foundersLockedPct: 40 }),
        ])
        matrix[plan.code][period.code] = { normal, founders }
      } catch {
        matrix[plan.code][period.code] = null
      }
    }
  }

  return { plans, periods, matrix }
}
