"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

// Маппинг типа счётчика на тип тарифа
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

export async function saveMeterReading(formData: FormData) {
  const meterId = formData.get("meterId") as string
  const valueStr = formData.get("value") as string
  const period = formData.get("period") as string

  const meter = await db.meter.findUnique({
    where: { id: meterId },
    include: {
      readings: { orderBy: { createdAt: "desc" }, take: 1 },
      space: { include: { tenant: true, floor: { include: { building: true } } } },
    },
  })
  if (!meter) return { error: "Счётчик не найден" }

  const value = parseFloat(valueStr)
  const previous = meter.readings[0]?.value ?? 0
  const consumption = Math.max(0, value - previous)

  await db.meterReading.create({
    data: { meterId, period, value, previous },
  })

  // Авто-начисление тенанту по тарифу из БД
  if (meter.space.tenant && consumption > 0) {
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
        where: { tenantId: meter.space.tenant.id, period, type: chargeType },
      })
      if (!existing) {
        await db.charge.create({
          data: {
            tenantId: meter.space.tenant.id,
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

export async function submitTenantMeterReading(formData: FormData) {
  const meterId = formData.get("meterId") as string
  const valueStr = formData.get("value") as string
  const period = new Date().toISOString().slice(0, 7)

  return saveMeterReading(
    Object.assign(new FormData(), { get: (k: string) => ({ meterId, value: valueStr, period }[k] ?? null) }) as FormData
  )
}

export async function createMeter(formData: FormData) {
  const spaceId = formData.get("spaceId") as string
  const type = formData.get("type") as string
  const number = formData.get("number") as string
  const initialValueStr = formData.get("initialValue") as string

  const meter = await db.meter.create({ data: { spaceId, type, number } })

  // Если задано начальное показание — создаём первое чтение в текущем периоде
  if (initialValueStr) {
    const initialValue = parseFloat(initialValueStr)
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
  await db.meter.delete({ where: { id: meterId } })
  revalidatePath("/admin/meters")
}

export async function deleteMeterReading(readingId: string) {
  await db.meterReading.delete({ where: { id: readingId } })
  revalidatePath("/admin/meters")
  revalidatePath("/cabinet/meters")
}
