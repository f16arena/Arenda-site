"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { assertMeterInOrg, assertSpaceInOrg } from "@/lib/scope-guards"
import { requireSection } from "@/lib/acl"
import { assertBuildingAccess } from "@/lib/building-access"

const TARIFF_TYPE_BY_METER: Record<string, string> = {
  ELECTRICITY: "ELECTRICITY",
  WATER: "WATER",
  HEAT: "HEATING",
}

const CHARGE_TYPE_BY_METER: Record<string, string> = {
  ELECTRICITY: "ELECTRICITY",
  WATER: "WATER",
  HEAT: "HEATING",
}

async function saveMeterReadingForMeter(meterId: string, valueStr: string, period: string) {
  const meter = await db.meter.findUnique({
    where: { id: meterId },
    include: {
      readings: { orderBy: { createdAt: "desc" }, take: 1 },
      space: {
        include: {
          tenant: true,
          tenantSpaces: { include: { tenant: true } },
          floor: { include: { building: true } },
        },
      },
    },
  })
  if (!meter) return { error: "Счётчик не найден" }

  const value = parseFloat(valueStr)
  if (!Number.isFinite(value) || value < 0) {
    return { error: "Введите корректное неотрицательное показание счётчика" }
  }

  const previous = meter.readings[0]?.value ?? 0
  if (value < previous) {
    return { error: `Текущее показание не может быть меньше предыдущего (${previous})` }
  }

  const consumption = Math.max(0, value - previous)

  await db.meterReading.create({
    data: { meterId, period, value, previous },
  })

  const tenant = meter.space.tenantSpaces[0]?.tenant ?? meter.space.tenant

  if (tenant && consumption > 0) {
    const tariffType = TARIFF_TYPE_BY_METER[meter.type]
    const tariff = tariffType
      ? await db.tariff.findFirst({
          where: {
            buildingId: meter.space.floor.building.id,
            type: tariffType,
            isActive: true,
          },
        })
      : null

    if (tariff) {
      const amount = Math.round(consumption * tariff.rate)
      const chargeType = CHARGE_TYPE_BY_METER[meter.type] ?? "OTHER"
      const existing = await db.charge.findFirst({
        where: { tenantId: tenant.id, period, type: chargeType },
      })
      if (!existing) {
        await db.charge.create({
          data: {
            tenantId: tenant.id,
            period,
            type: chargeType,
            amount,
            description: `${tariff.name}: ${consumption} ${tariff.unit} × ${tariff.rate} ₸`,
            dueDate: new Date(parseInt(period.split("-")[0]), parseInt(period.split("-")[1]) - 1, 10),
          },
        })
      }
    }
  }

  revalidatePath("/admin/meters")
  revalidatePath("/cabinet/meters")
  return { success: true, consumption }
}

export async function saveMeterReading(formData: FormData) {
  await requireSection("meters", "edit")
  const { orgId } = await requireOrgAccess()
  const meterId = formData.get("meterId") as string
  await assertMeterInOrg(meterId, orgId)
  const meter = await db.meter.findUnique({
    where: { id: meterId },
    select: { space: { select: { floor: { select: { buildingId: true } } } } },
  })
  if (!meter) throw new Error("Счётчик не найден")
  await assertBuildingAccess(meter.space.floor.buildingId, orgId)

  const valueStr = formData.get("value") as string
  const period = formData.get("period") as string
  return saveMeterReadingForMeter(meterId, valueStr, period)
}

// Tenant-side: показания от арендатора. Проверяем, что счётчик
// действительно принадлежит арендатору-в-сессии.
export async function submitTenantMeterReading(formData: FormData) {
  const session = await auth()
  if (!session?.user) throw new Error("Не авторизован")

  const meterId = formData.get("meterId") as string
  const valueStr = formData.get("value") as string
  const period = new Date().toISOString().slice(0, 7)

  // Счётчик должен быть в помещении, где арендатор — текущий пользователь
  const owns = await db.meter.findFirst({
    where: {
      id: meterId,
      space: {
        OR: [
          { tenant: { userId: session.user.id } },
          { tenantSpaces: { some: { tenant: { userId: session.user.id } } } },
        ],
      },
    },
    select: { id: true },
  })
  if (!owns) throw new Error("Счётчик не принадлежит вам")

  return saveMeterReadingForMeter(meterId, valueStr, period)
}

export async function createMeter(formData: FormData) {
  await requireSection("meters", "edit")
  const { orgId } = await requireOrgAccess()
  const spaceId = formData.get("spaceId") as string
  await assertSpaceInOrg(spaceId, orgId)
  const space = await db.space.findUnique({
    where: { id: spaceId },
    select: { floor: { select: { buildingId: true } } },
  })
  if (!space) throw new Error("Помещение не найдено")
  await assertBuildingAccess(space.floor.buildingId, orgId)

  const type = formData.get("type") as string
  const number = String(formData.get("number") ?? "").trim()
  const initialValueStr = formData.get("initialValue") as string
  const allowedTypes = new Set(["ELECTRICITY", "WATER", "HEAT"])

  if (!allowedTypes.has(type)) throw new Error("Выберите корректный тип счётчика")
  if (!number) throw new Error("Укажите номер счётчика")

  const meter = await db.meter.create({ data: { spaceId, type, number } })

  if (initialValueStr) {
    const initialValue = parseFloat(initialValueStr)
    if (!Number.isFinite(initialValue) || initialValue < 0) {
      throw new Error("Начальное показание должно быть неотрицательным числом")
    }
    if (!Number.isNaN(initialValue)) {
      const period = new Date().toISOString().slice(0, 7)
      await db.meterReading.create({
        data: { meterId: meter.id, period, value: initialValue, previous: 0 },
      })
    }
  }

  revalidatePath("/admin/meters")
  return { success: true }
}

export async function deleteMeter(meterId: string) {
  await requireSection("meters", "edit")
  const { orgId } = await requireOrgAccess()

  const meter = await db.meter.findFirst({
    where: {
      id: meterId,
      space: { floor: { building: { organizationId: orgId } } },
    },
    select: { id: true, space: { select: { floor: { select: { buildingId: true } } } } },
  })
  if (!meter) return { error: "Счётчик не найден или нет доступа" }
  await assertBuildingAccess(meter.space.floor.buildingId, orgId)

  const [readings] = await db.$transaction([
    db.meterReading.deleteMany({ where: { meterId } }),
    db.meter.delete({ where: { id: meterId } }),
  ])

  revalidatePath("/admin/meters")
  revalidatePath("/cabinet/meters")
  return { success: true, readingsDeleted: readings.count }
}

export async function deleteMeterReading(readingId: string) {
  await requireSection("meters", "edit")
  const { orgId } = await requireOrgAccess()
  // Проверка через scope: meter → space → floor → building → org
  const reading = await db.meterReading.findFirst({
    where: {
      id: readingId,
      meter: { space: { floor: { building: { organizationId: orgId } } } },
    },
    select: { id: true },
  })
  if (!reading) throw new Error("Показание не найдено или нет доступа")

  await db.meterReading.delete({ where: { id: readingId } })
  revalidatePath("/admin/meters")
  revalidatePath("/cabinet/meters")
}
