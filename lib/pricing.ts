import { db } from "@/lib/db"

/**
 * Расчёт цены подписки со стэком скидок:
 *   total% = period% + foundersLockedPct, но не больше plan.discountStackCapPct.
 * Возвращает разбивку и итог — для UI и сохранения в Subscription.discountBreakdown.
 */

export type PriceBreakdown = {
  planCode: string
  basePriceMonthly: number
  monthsCount: number
  periodDiscountPct: number
  foundersDiscountPct: number
  capPct: number
  appliedDiscountPct: number   // после cap
  totalBeforeDiscount: number  // basePriceMonthly * monthsCount
  totalPriceFinal: number      // после скидки
  pricePerMonth: number        // totalPriceFinal / monthsCount
  savings: number              // totalBeforeDiscount - totalPriceFinal
  bonusMessage: string | null
}

export async function calculatePrice(input: {
  planCode: string
  billingPeriodCode: string
  isFoundersMember?: boolean
  foundersLockedPct?: number
}): Promise<PriceBreakdown> {
  const [plan, period] = await Promise.all([
    db.plan.findUnique({ where: { code: input.planCode } }),
    db.billingPeriod.findUnique({ where: { code: input.billingPeriodCode } }),
  ])
  if (!plan) throw new Error(`План ${input.planCode} не найден`)
  if (!period) throw new Error(`Период ${input.billingPeriodCode} не найден`)

  const basePriceMonthly = plan.priceMonthly
  const monthsCount = period.monthsCount
  const periodDiscountPct = period.discountPct
  const foundersDiscountPct = input.isFoundersMember ? (input.foundersLockedPct ?? plan.foundersDiscountPct ?? 40) : 0
  const capPct = plan.discountStackCapPct ?? 50
  const stacked = periodDiscountPct + foundersDiscountPct
  const appliedDiscountPct = Math.min(stacked, capPct)

  const totalBeforeDiscount = Math.round(basePriceMonthly * monthsCount)
  const totalPriceFinal = Math.round(totalBeforeDiscount * (1 - appliedDiscountPct / 100))
  const pricePerMonth = monthsCount > 0 ? Math.round(totalPriceFinal / monthsCount) : totalPriceFinal
  const savings = totalBeforeDiscount - totalPriceFinal

  return {
    planCode: plan.code,
    basePriceMonthly,
    monthsCount,
    periodDiscountPct,
    foundersDiscountPct,
    capPct,
    appliedDiscountPct,
    totalBeforeDiscount,
    totalPriceFinal,
    pricePerMonth,
    savings,
    bonusMessage: period.bonusMessage,
  }
}

/**
 * Атомарный резерв слота Founders для организации.
 * Возвращает success=false если слотов нет / программа неактивна / уже Founders.
 */
export async function tryReserveFoundersSlot(orgId: string): Promise<{ success: boolean; slotNumber?: number; reason?: string }> {
  return db.$transaction(async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { isFoundersMember: true, planId: true, plan: { select: { code: true } } },
    })
    if (!org) return { success: false, reason: "Организация не найдена" }
    if (org.isFoundersMember) return { success: false, reason: "Уже участник Founders" }
    if (org.plan?.code === "FREE") return { success: false, reason: "Free-тариф не участвует в Founders" }

    const state = await tx.foundersProgramState.findUnique({ where: { id: "singleton" } })
    if (!state || !state.isActive) return { success: false, reason: "Программа неактивна" }
    if (state.takenSlots >= state.totalSlots) return { success: false, reason: "Слоты закончились" }

    const slotNumber = state.takenSlots + 1
    await tx.foundersProgramState.update({
      where: { id: "singleton" },
      data: { takenSlots: { increment: 1 } },
    })
    await tx.organization.update({
      where: { id: orgId },
      data: {
        isFoundersMember: true,
        foundersLockedPct: state.discountPct,
        foundersJoinedAt: new Date(),
        foundersSlotNumber: slotNumber,
      },
    })
    return { success: true, slotNumber }
  })
}

/**
 * Освободить слот Founders, если клиент ушёл > 60 дней (для cron-задачи).
 */
export async function releaseFoundersSlotIfExpired(orgId: string, suspendedSinceDays: number): Promise<boolean> {
  if (suspendedSinceDays < 60) return false
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { isFoundersMember: true },
  })
  if (!org?.isFoundersMember) return false

  await db.$transaction([
    db.organization.update({
      where: { id: orgId },
      data: { isFoundersMember: false, foundersLockedPct: 0, foundersSlotNumber: null },
    }),
    db.foundersProgramState.update({
      where: { id: "singleton" },
      data: { takenSlots: { decrement: 1 } },
    }),
  ])
  return true
}

/** Остаток слотов для отображения на лендинге («осталось 8 из 15»). */
export async function getFoundersRemainingSlots(): Promise<{ remaining: number; total: number; isActive: boolean }> {
  const state = await db.foundersProgramState.findUnique({ where: { id: "singleton" } })
  if (!state) return { remaining: 0, total: 15, isActive: false }
  return {
    remaining: Math.max(0, state.totalSlots - state.takenSlots),
    total: state.totalSlots,
    isActive: state.isActive && state.takenSlots < state.totalSlots,
  }
}
