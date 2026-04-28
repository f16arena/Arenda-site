"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function calculatePenalties() {
  const today = new Date()
  const period = today.toISOString().slice(0, 7)

  const overdueCharges = await db.charge.findMany({
    where: {
      isPaid: false,
      dueDate: { lt: today },
      type: { not: "PENALTY" },
    },
    include: { tenant: true },
  })

  let penaltiesCreated = 0
  const DAILY_RATE = 0.01    // 1% в день
  const MAX_RATE   = 0.10    // максимум 10% от суммы

  for (const charge of overdueCharges) {
    const daysOverdue = Math.floor(
      (today.getTime() - charge.dueDate!.getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysOverdue <= 0) continue

    const penaltyRate = Math.min(daysOverdue * DAILY_RATE, MAX_RATE)
    const penaltyAmount = Math.round(charge.amount * penaltyRate)
    if (penaltyAmount < 100) continue // минимальная пеня 100 тенге

    // Проверяем: уже есть пеня по этому начислению?
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
