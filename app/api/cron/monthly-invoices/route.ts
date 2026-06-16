import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { authorizeCronRequest } from "@/lib/cron-auth"
import { calculateTenantRentChargeForPeriod, getTenantRentChargeDescription } from "@/lib/rent"
import { calculateServiceFeeForPeriod } from "@/lib/service-fee"
import { applyTenantCreditToCharges } from "@/lib/tenant-credit"
import { notifyUser } from "@/lib/notify"
import { formatTenantPlacement } from "@/lib/tenant-placement"
import { isUniqueConstraintError } from "@/lib/prisma-errors"

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
  const previousPeriod = getPreviousPeriod(period)

  // Auto-invoice cron — гейт по фиче `autoInvoiceCron`.
  // Берём орг, у которых план включает фичу; остальные пропускаем тихо.
  const orgsWithFeature = await db.organization.findMany({
    where: { isActive: true, isSuspended: false },
    select: { id: true, plan: { select: { features: true } } },
  })
  const allowedOrgIds = orgsWithFeature
    .filter((o) => {
      try {
        const f = o.plan?.features ? JSON.parse(o.plan.features) : null
        return f?.flags?.autoInvoiceCron === true
      } catch { return false }
    })
    .map((o) => o.id)
  if (allowedOrgIds.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, rentCreated: 0, cleaningCreated: 0, skipped: 0, note: "no orgs with autoInvoiceCron" })
  }

  const tenants = await db.tenant.findMany({
    where: {
      // Tenant скоупится через user.organizationId (там — единственный безопасный путь).
      user: { organizationId: { in: allowedOrgIds } },
      OR: [
        { spaceId: { not: null } },
        { tenantSpaces: { some: {} } },
        { fullFloors: { some: {} } },
        { fixedMonthlyRent: { gt: 0 } },
      ],
    },
    include: {
      // Подгружаем здание через каждый источник площади — нужно для service fee.
      space: { include: { floor: { include: { building: true } } } },
      tenantSpaces: { include: { space: { include: { floor: { include: { building: true } } } } } },
      fullFloors: { include: { building: true } },
      charges: {
        where: { period: { in: [period, previousPeriod] }, type: { in: ["RENT", "SERVICE_FEE"] } },
        select: { id: true, period: true, type: true },
      },
      // Активный договор (SIGNED) — нужен чтобы привязать новые charges к контракту.
      // Берём самый свежий: версия N важнее, при равных datestap — последняя.
      contracts: {
        where: { status: "SIGNED", deletedAt: null },
        orderBy: [{ version: "desc" }, { signedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { id: true },
      },
    },
  })

  const results = {
    checked: tenants.length,
    rentCreated: 0,
    cleaningCreated: 0,
    serviceFeeCreated: 0,
    skipped: 0,
    errors: [] as string[],
  }

  for (const tenant of tenants) {
    try {
      const chargePeriods = getCronRentPeriods(tenant, period)
      const existingRentPeriods = new Set(tenant.charges.map((charge) => charge.period))

      for (const chargePeriod of chargePeriods) {
        if (existingRentPeriods.has(chargePeriod)) {
          results.skipped++
          continue
        }

        const rentSchedule = calculateTenantRentChargeForPeriod(tenant, chargePeriod)
        if (!rentSchedule.shouldCreate) {
          if (rentSchedule.skippedReason !== "NO_RENT") {
            results.skipped++
          }
          continue
        }

        const placement = formatTenantPlacement(tenant)
        const dueDate = rentSchedule.dueDate
        const activeContractId = tenant.contracts[0]?.id ?? null

        // try/catch P2002: partial unique index из миграции 020 защищает от
        // одновременного запуска cron + ручной generateMonthlyCharges.
        // Если ручной запуск опередил — просто пропускаем.
        try {
          await db.charge.create({
            data: {
              tenantId: tenant.id,
              contractId: activeContractId,
              period: chargePeriod,
              type: "RENT",
              amount: rentSchedule.amount,
              description: getTenantRentChargeDescription(placement, chargePeriod, rentSchedule),
              dueDate,
            },
          })
          results.rentCreated++
        } catch (e) {
          if (isUniqueConstraintError(e)) {
            results.skipped++
          } else {
            throw e
          }
        }
        existingRentPeriods.add(chargePeriod)

        if (tenant.needsCleaning && tenant.cleaningFee > 0) {
          try {
            await db.charge.create({
              data: {
                tenantId: tenant.id,
                contractId: activeContractId,
                period: chargePeriod,
                type: "CLEANING",
                amount: tenant.cleaningFee,
                description: `Уборка помещения за ${chargePeriod}`,
                dueDate,
              },
            })
            results.cleaningCreated++
          } catch (e) {
            if (isUniqueConstraintError(e)) {
              results.skipped++
            } else {
              throw e
            }
          }
        }

        // Эксплуатационный сбор (Приложение №3) — если у здания заданы тарифы.
        // Берём данные здания из любого источника площади (space/tenantSpace/fullFloor).
        const buildingForFee =
          tenant.space?.floor.building ??
          tenant.tenantSpaces[0]?.space.floor.building ??
          tenant.fullFloors[0]?.building ??
          null
        if (buildingForFee && !tenant.serviceFeeExempt) {
          const existingServiceFeeForPeriod = tenant.charges.some(
            (c) => c.period === chargePeriod && c.type === "SERVICE_FEE",
          )
          if (!existingServiceFeeForPeriod) {
            const fee = calculateServiceFeeForPeriod(tenant, buildingForFee, chargePeriod, tenant.paymentDueDay ?? 10)
            if (fee.shouldCreate && fee.amount > 0) {
              try {
                await db.charge.create({
                  data: {
                    tenantId: tenant.id,
                    contractId: activeContractId,
                    period: chargePeriod,
                    type: "SERVICE_FEE",
                    amount: fee.amount,
                    description: fee.description,
                    dueDate: fee.dueDate,
                  },
                })
                results.serviceFeeCreated++
              } catch (e) {
                if (isUniqueConstraintError(e)) {
                  results.skipped++
                } else {
                  throw e
                }
              }
            }
          }
        }

        // Накопленный аванс (переплата) автоматически гасит свежесозданные начисления.
        await applyTenantCreditToCharges(tenant.id)

        try {
          const totalCharge = rentSchedule.amount + (tenant.needsCleaning ? tenant.cleaningFee : 0)
          // notifyUser вместо голого notification.create: уважает настройки каналов
          // и доносит начисление по email/Telegram, а не только в колокольчик.
          await notifyUser({
            userId: tenant.userId,
            type: "PAYMENT_DUE",
            title: `Начислена аренда за ${chargePeriod}`,
            message: `Сумма к оплате: ${totalCharge.toLocaleString("ru-RU")} ₸. Срок оплаты — до ${dueDate.toLocaleDateString("ru-RU")}.`,
            link: "/cabinet/finances",
            dedupWindowHours: 20,
          })
        } catch {
          // Notifications are best-effort: charge creation should not fail because of them.
        }
      }
    } catch (e) {
      results.errors.push(`${tenant.companyName}: ${e instanceof Error ? e.message : "unknown"}`)
    }
  }

  return NextResponse.json({ ok: true, period, ...results, ranAt: now.toISOString() })
}

function getCronRentPeriods(
  tenant: { contractStart?: Date | string | null; paymentDueDay?: number | null },
  currentPeriod: string,
) {
  const periods = new Set<string>()
  const startPeriodDueNow = getStartPeriodDueInPeriod(tenant, currentPeriod)

  if (startPeriodDueNow) {
    periods.add(startPeriodDueNow)
  }

  periods.add(currentPeriod)
  return [...periods]
}

function getStartPeriodDueInPeriod(
  tenant: { contractStart?: Date | string | null; paymentDueDay?: number | null },
  currentPeriod: string,
) {
  const contractStart = toLocalDate(tenant.contractStart)
  if (!contractStart || contractStart.getDate() === 1) return null

  const paymentDueDay = normalizePaymentDueDay(tenant.paymentDueDay)
  const accountingDueDay = Math.min(paymentDueDay, 30)
  const startDay = Math.min(contractStart.getDate(), 30)
  const firstDueMonthIndex = startDay >= accountingDueDay
    ? contractStart.getMonth() + 1
    : contractStart.getMonth()
  const firstDuePeriod = formatPeriod(new Date(contractStart.getFullYear(), firstDueMonthIndex, 1))

  if (firstDuePeriod !== currentPeriod) return null
  return formatPeriod(new Date(contractStart.getFullYear(), contractStart.getMonth(), 1))
}

function getPreviousPeriod(period: string) {
  const [year, month] = period.split("-").map(Number)
  return formatPeriod(new Date(year, month - 2, 1))
}

function formatPeriod(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function normalizePaymentDueDay(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 10
  return Math.min(Math.max(Math.trunc(value), 1), 31)
}

function toLocalDate(value: Date | string | null | undefined) {
  if (!value) return null
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
