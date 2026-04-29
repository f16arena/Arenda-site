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
    include: { tenant: true },
  })

  let penaltiesCreated = 0
  const DAILY_RATE = 0.01
  const MAX_RATE = 0.10

  for (const charge of overdueCharges) {
    const daysOverdue = Math.floor(
      (today.getTime() - charge.dueDate!.getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysOverdue <= 0) continue

    const penaltyRate = Math.min(daysOverdue * DAILY_RATE, MAX_RATE)
    const penaltyAmount = Math.round(charge.amount * penaltyRate)
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
        description: `Пеня ${Math.round(penaltyRate * 100)}% за просрочку (${daysOverdue} дн.) · ref:${charge.id}`,
      },
    })
    penaltiesCreated++
  }

  revalidatePath("/admin/finances")
  revalidatePath("/admin/tenants")
  return { success: true, penaltiesCreated }
}
