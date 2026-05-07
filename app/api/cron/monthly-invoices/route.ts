import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { authorizeCronRequest } from "@/lib/cron-auth"
import { calculateTenantRentChargeForPeriod, getTenantRentChargeDescription } from "@/lib/rent"
import { formatTenantPlacement } from "@/lib/tenant-placement"

export const dynamic = "force-dynamic"

// Runs on the 1st day of each month and creates RENT/CLEANING charges for active tenants.
// The rent amount and due date must go through the shared rent schedule helper so cron,
// manual finance generation, and billing batches stay consistent.

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
      if (tenant.charges.length > 0) {
        results.skipped++
        continue
      }

      const rentSchedule = calculateTenantRentChargeForPeriod(tenant, period)
      if (!rentSchedule.shouldCreate) {
        if (rentSchedule.skippedReason !== "NO_RENT") {
          results.skipped++
        }
        continue
      }

      const placement = formatTenantPlacement(tenant)
      const dueDate = rentSchedule.dueDate

      await db.charge.create({
        data: {
          tenantId: tenant.id,
          period,
          type: "RENT",
          amount: rentSchedule.amount,
          description: getTenantRentChargeDescription(placement, period, rentSchedule),
          dueDate,
        },
      })
      results.rentCreated++

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

      try {
        const totalCharge = rentSchedule.amount + (tenant.needsCleaning ? tenant.cleaningFee : 0)
        await db.notification.create({
          data: {
            userId: tenant.userId,
            type: "PAYMENT_DUE",
            title: `Начислена аренда за ${period}`,
            message: `Сумма к оплате: ${totalCharge.toLocaleString("ru-RU")} ₸. Срок оплаты — до ${dueDate.toLocaleDateString("ru-RU")}.`,
            link: "/cabinet/finances",
          },
        })
      } catch {
        // Notifications are best-effort: charge creation should not fail because of them.
      }
    } catch (e) {
      results.errors.push(`${tenant.companyName}: ${e instanceof Error ? e.message : "unknown"}`)
    }
  }

  return NextResponse.json({ ok: true, period, ...results, ranAt: now.toISOString() })
}
