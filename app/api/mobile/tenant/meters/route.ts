import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { resolveMeterTariff } from "@/lib/meter-tariff"
import { mobileError } from "@/lib/mobile-context"
import { currentPeriod, getMobileTenantRequest, getMobileTenantScope } from "@/lib/mobile-tenant"
import { getTForUser } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"

const CHARGE_TYPE_BY_METER: Record<string, string> = {
  ELECTRICITY: "ELECTRICITY",
  WATER: "WATER",
  HEAT: "HEATING",
}

export async function GET(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const scope = await getMobileTenantScope(result.tenant)
  const period = currentPeriod()
  const meters = scope.spaceIds.length > 0
    ? await db.meter.findMany({
        where: { spaceId: { in: scope.spaceIds } },
        select: {
          id: true,
          type: true,
          number: true,
          spaceId: true,
          space: {
            select: {
              number: true,
              floor: {
                select: {
                  name: true,
                  building: { select: { id: true, name: true, address: true } },
                },
              },
            },
          },
          readings: {
            select: { id: true, period: true, value: true, previous: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 3,
          },
        },
        orderBy: [{ type: "asc" }, { number: "asc" }],
      })
    : []

  return NextResponse.json({
    period,
    spaces: scope.spaces.map((space) => ({
      id: space.id,
      number: space.number,
      area: space.area,
      floorName: space.floor.name,
      building: space.floor.building,
    })),
    data: meters.map((meter) => {
      const latest = meter.readings[0] ?? null
      const hasCurrent = latest?.period === period
      return {
        ...meter,
        latest,
        hasCurrent,
        previousValue: latest && hasCurrent ? latest.previous : latest?.value ?? 0,
        currentValue: hasCurrent ? latest?.value ?? null : null,
        consumption: latest && hasCurrent ? Math.max(0, latest.value - latest.previous) : null,
      }
    }),
  })
}

export async function POST(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { ctx, tenant } = result
  // Ошибки читает арендатор — язык из его профиля (bearer-запрос без cookie).
  const { t } = await getTForUser(ctx.user.id)
  const scope = await getMobileTenantScope(tenant)
  const body = await req.json().catch(() => null) as {
    meterId?: string
    value?: unknown
    period?: string
  } | null

  const meterId = String(body?.meterId ?? "").trim()
  const value = Number(String(body?.value ?? "").replace(/\s/g, "").replace(",", "."))
  const period = String(body?.period ?? currentPeriod()).trim()

  if (!meterId) return mobileError("meterId is required")
  if (!Number.isFinite(value) || value < 0) return mobileError(t("adminDocs.api.meters.badReading"))
  if (!/^\d{4}-\d{2}$/.test(period)) return mobileError(t("adminDocs.api.meters.badPeriod"))

  const meter = await db.meter.findFirst({
    where: {
      id: meterId,
      spaceId: { in: scope.spaceIds.length > 0 ? scope.spaceIds : ["__none__"] },
    },
    select: {
      id: true,
      type: true,
      number: true,
      readings: {
        select: { value: true, period: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      space: {
        select: {
          floor: {
            select: {
              buildingId: true,
            },
          },
        },
      },
    },
  })

  if (!meter) return mobileError(t("adminDocs.api.meters.notYours"), 404)

  const previous = meter.readings[0]?.value ?? 0
  if (value < previous) {
    return mobileError(t("adminDocs.api.meters.lessThanPrevious", { previous }))
  }

  const reading = await db.meterReading.create({
    data: { meterId, period, value, previous },
    select: { id: true, period: true, value: true, previous: true, createdAt: true },
  })

  const consumption = Math.max(0, value - previous)
  if (consumption > 0) {
    const tariff = await resolveMeterTariff(tenant.id, meter.type, meter.space.floor.buildingId)

    if (tariff) {
      const amount = Math.round(consumption * tariff.rate)
      const chargeType = CHARGE_TYPE_BY_METER[meter.type] ?? "OTHER"
      const existing = await db.charge.findFirst({
        where: { tenantId: tenant.id, period, type: chargeType },
        select: { id: true },
      })

      if (!existing) {
        const [year, month] = period.split("-").map((part) => parseInt(part, 10))
        await db.charge.create({
          data: {
            tenantId: tenant.id,
            period,
            type: chargeType,
            amount,
            description: `${tariff.name}: ${consumption} ${tariff.unit} x ${tariff.rate} ₸`,
            dueDate: new Date(year, month - 1, 10),
          },
        })
      }
    }
  }

  return NextResponse.json({ data: reading, consumption }, { status: 201 })
}
