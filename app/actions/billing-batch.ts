"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { tenantScope } from "@/lib/tenant-scope"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { formatTenantPlacement } from "@/lib/tenant-placement"

export type BatchBillingResult = {
  ok: true
  period: string
  rentCreated: number
  cleaningCreated: number
  skipped: number
  totalAmount: number
  errors: string[]
} | {
  ok: false
  error: string
}

/**
 * Создать начисления RENT (и CLEANING при needsCleaning) за указанный период
 * для всех арендаторов в организации, которые ещё не имеют начислений в этом
 * периоде. Идемпотентно — повторный запуск не создаст дубликатов.
 */
export async function generateMonthlyChargesForOrg(period: string): Promise<BatchBillingResult> {
  await requireCapabilityAndFeature("finance.createInvoice")
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return { ok: false, error: "Неверный формат периода (ожидается YYYY-MM)" }
  }
  const { orgId } = await requireOrgAccess()

  const tenants = await db.tenant.findMany({
    where: {
      ...tenantScope(orgId),
      OR: [
        { spaceId: { not: null } },
        { tenantSpaces: { some: {} } },
        { fullFloors: { some: {} } },
        { fixedMonthlyRent: { gt: 0 } },
      ],
    },
    include: {
      space: { include: { floor: true } },
      tenantSpaces: { include: { space: { include: { floor: true } } } },
      fullFloors: true,
      charges: { where: { period, type: "RENT" }, select: { id: true } },
    },
  })

  const result: BatchBillingResult = {
    ok: true,
    period,
    rentCreated: 0,
    cleaningCreated: 0,
    skipped: 0,
    totalAmount: 0,
    errors: [],
  }

  // Дата платежа = paymentDueDay числа в указанном месяце
  const [year, month] = period.split("-").map(Number)

  for (const t of tenants) {
    try {
      if (t.charges.length > 0) {
        (result as { skipped: number }).skipped++
        continue
      }

      const monthlyRent = calculateTenantMonthlyRent(t)
      if (monthlyRent <= 0) continue

      const placement = formatTenantPlacement(t)
      const dueDate = new Date(year, month - 1, t.paymentDueDay)

      await db.charge.create({
        data: {
          tenantId: t.id,
          period,
          type: "RENT",
          amount: monthlyRent,
          description: `Аренда ${placement} за ${period}`,
          dueDate,
        },
      })
      ;(result as { rentCreated: number }).rentCreated++
      ;(result as { totalAmount: number }).totalAmount += monthlyRent

      if (t.needsCleaning && t.cleaningFee > 0) {
        await db.charge.create({
          data: {
            tenantId: t.id,
            period,
            type: "CLEANING",
            amount: t.cleaningFee,
            description: `Уборка помещения за ${period}`,
            dueDate,
          },
        })
        ;(result as { cleaningCreated: number }).cleaningCreated++
        ;(result as { totalAmount: number }).totalAmount += t.cleaningFee
      }

      // In-app уведомление
      try {
        const total = monthlyRent + (t.needsCleaning ? t.cleaningFee : 0)
        await db.notification.create({
          data: {
            userId: t.userId,
            type: "PAYMENT_DUE",
            title: `Начислена аренда за ${period}`,
            message: `Сумма к оплате: ${total.toLocaleString("ru-RU")} ₸. Срок — до ${t.paymentDueDay} числа.`,
            link: "/cabinet/finances",
          },
        })
      } catch { /* notifications may be missing */ }
    } catch (e) {
      (result as { errors: string[] }).errors.push(
        `${t.companyName}: ${e instanceof Error ? e.message : "unknown"}`,
      )
    }
  }

  revalidatePath("/admin/finances")
  revalidatePath("/admin")
  return result
}
