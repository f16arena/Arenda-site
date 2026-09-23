"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { tenantScope } from "@/lib/tenant-scope"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { calculateTenantRentChargeForPeriod, getTenantRentChargeDescription } from "@/lib/rent"
import { formatTenantPlacement } from "@/lib/tenant-placement"
import { getT, getTForUser } from "@/lib/i18n/server"
import { formatDateL, formatMoneyL, formatPeriodL } from "@/lib/i18n/format"

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
  const { t } = await getT()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return { ok: false, error: t("actions.billingBatch.badPeriodFormat") }
  }
  const { orgId } = await requireOrgAccess()

  const tenants = await db.tenant.findMany({
    where: {
      // AND, не spread: второй OR затирал бы OR изоляции организации.
      AND: [
        tenantScope(orgId),
        { OR: [
          { spaceId: { not: null } },
          { tenantSpaces: { some: {} } },
          { fullFloors: { some: {} } },
          { fixedMonthlyRent: { gt: 0 } },
        ] },
      ],
    },
    include: {
      space: { include: { floor: true } },
      tenantSpaces: { include: { space: { include: { floor: true } } } },
      fullFloors: true,
      charges: { where: { deletedAt: null, period, type: "RENT" }, select: { id: true } },
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

  for (const row of tenants) {
    try {
      if (row.charges.length > 0) {
        (result as { skipped: number }).skipped++
        continue
      }

      const rentSchedule = calculateTenantRentChargeForPeriod(row, period)
      if (!rentSchedule.shouldCreate) {
        if (rentSchedule.skippedReason !== "NO_RENT") {
          (result as { skipped: number }).skipped++
        }
        continue
      }

      const placement = formatTenantPlacement(row)
      const dueDate = rentSchedule.dueDate

      await db.charge.create({
        data: {
          tenantId: row.id,
          period,
          type: "RENT",
          amount: rentSchedule.amount,
          description: getTenantRentChargeDescription(placement, period, rentSchedule),
          dueDate,
        },
      })
      ;(result as { rentCreated: number }).rentCreated++
      ;(result as { totalAmount: number }).totalAmount += rentSchedule.amount

      if (row.needsCleaning && row.cleaningFee > 0) {
        await db.charge.create({
          data: {
            tenantId: row.id,
            period,
            type: "CLEANING",
            // description начисления попадает в счёт и акт сверки — оставляем русским.
            amount: row.cleaningFee,
            description: `Уборка помещения за ${period}`,
            dueDate,
          },
        })
        ;(result as { cleaningCreated: number }).cleaningCreated++
        ;(result as { totalAmount: number }).totalAmount += row.cleaningFee
      }

      // In-app уведомление. Его читает арендатор — язык берём из его профиля,
      // а не у того, кто запустил массовое начисление.
      try {
        const total = rentSchedule.amount + (row.needsCleaning ? row.cleaningFee : 0)
        const { t: tTenant, locale } = await getTForUser(row.userId)
        await db.notification.create({
          data: {
            userId: row.userId,
            type: "PAYMENT_DUE",
            title: tTenant("actions.billingBatch.rentChargedTitle", { period: formatPeriodL(locale, period) }),
            message: tTenant("actions.billingBatch.rentChargedMessage", {
              amount: formatMoneyL(locale, total),
              date: formatDateL(locale, dueDate),
            }),
            link: "/cabinet/finances",
          },
        })
      } catch { /* notifications may be missing */ }
    } catch (e) {
      (result as { errors: string[] }).errors.push(
        `${row.companyName}: ${e instanceof Error ? e.message : "unknown"}`,
      )
    }
  }

  revalidatePath("/admin/finances")
  revalidatePath("/admin")
  return result
}
