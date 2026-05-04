import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { authorizeCronRequest } from "@/lib/cron-auth"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { formatTenantPlacement } from "@/lib/tenant-placement"

export const dynamic = "force-dynamic"

// Запускается 1-го числа каждого месяца в 9:00 Алматы
// Создаёт начисления RENT для всех активных арендаторов

export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const now = new Date()
  const period = now.toISOString().slice(0, 7) // YYYY-MM

  const tenants = await db.tenant.findMany({
    where: {
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

  const results = {
    checked: tenants.length,
    rentCreated: 0,
    cleaningCreated: 0,
    skipped: 0,
    errors: [] as string[],
  }

  for (const tenant of tenants) {
    try {
      // Если на этот период RENT уже создан — пропускаем
      if (tenant.charges.length > 0) {
        results.skipped++
        continue
      }

      const monthlyRent = calculateTenantMonthlyRent(tenant)

      if (monthlyRent <= 0) continue

      const placement = formatTenantPlacement(tenant)
      const dueDate = new Date(now.getFullYear(), now.getMonth(), tenant.paymentDueDay)

      await db.charge.create({
        data: {
          tenantId: tenant.id,
          period,
          type: "RENT",
          amount: monthlyRent,
          description: `Аренда ${placement} за ${period}`,
          dueDate,
        },
      })
      results.rentCreated++

      // Уборка — если включена
      if (tenant.needsCleaning && tenant.cleaningFee > 0) {
        await db.charge.create({
          data: {
            tenantId: tenant.id,
            period,
            type: "CLEANING",
            amount: tenant.cleaningFee,
            description: `Уборка помещения за ${period}`,
            dueDate,
          },
        })
        results.cleaningCreated++
      }

      // In-app уведомление + Telegram арендатору
      try {
        const totalCharge = monthlyRent + (tenant.needsCleaning ? tenant.cleaningFee : 0)
        await db.notification.create({
          data: {
            userId: tenant.userId,
            type: "PAYMENT_DUE",
            title: `Начислена аренда за ${period}`,
            message: `Сумма к оплате: ${totalCharge.toLocaleString("ru-RU")} ₸. Срок оплаты — до ${tenant.paymentDueDay} числа.`,
            link: "/cabinet/finances",
          },
        })
      } catch { /* notifications table may be missing */ }
    } catch (e) {
      results.errors.push(`${tenant.companyName}: ${e instanceof Error ? e.message : "unknown"}`)
    }
  }

  return NextResponse.json({ ok: true, period, ...results, ranAt: now.toISOString() })
}
