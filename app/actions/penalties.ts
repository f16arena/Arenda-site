"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { chargeScope } from "@/lib/tenant-scope"

export async function calculatePenalties() {
  const { orgId } = await requireOrgAccess()

  const today = new Date()
  const period = today.toISOString().slice(0, 7)

  // Только начисления арендаторов текущей организации
  const overdueCharges = await db.charge.findMany({
    where: {
      ...chargeScope(orgId),
      isPaid: false,
      dueDate: { lt: today },
      type: { not: "PENALTY" },
    },
    include: { tenant: { select: { id: true, penaltyPercent: true } } },
  })

  let penaltiesCreated = 0
  // Ставка пени берётся из Tenant.penaltyPercent (по умолчанию 1%/день);
  // суммарно не более 10% от тела начисления (та же формула, что у cron
  // check-deadlines, чтобы ручная кнопка и автомат не расходились).
  const MAX_PCT = 10

  for (const charge of overdueCharges) {
    const daysOverdue = Math.floor(
      (today.getTime() - charge.dueDate!.getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysOverdue <= 0) continue

    const dailyPct = charge.tenant.penaltyPercent ?? 1
    const totalPct = Math.min(dailyPct * daysOverdue, MAX_PCT)
    const penaltyAmount = Math.round(charge.amount * (totalPct / 100))
    if (penaltyAmount < 100) continue

    const existing = await db.charge.findFirst({
      where: {
        tenantId: charge.tenantId,
        period,
        type: "PENALTY",
        description: { contains: charge.id },
      },
    })
    if (existing) continue

    await db.charge.create({
      data: {
        tenantId: charge.tenantId,
        period,
        type: "PENALTY",
        amount: penaltyAmount,
        description: `Пеня ${totalPct.toFixed(1)}% за просрочку (${daysOverdue} дн. × ${dailyPct}%, не более ${MAX_PCT}%) · ref:${charge.id}`,
      },
    })
    penaltiesCreated++
  }

  revalidatePath("/admin/finances")
  revalidatePath("/admin/tenants")
  return { success: true, penaltiesCreated }
}
