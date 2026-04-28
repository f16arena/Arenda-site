"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function saveMeterReading(formData: FormData) {
  const meterId = formData.get("meterId") as string
  const valueStr = formData.get("value") as string
  const period = formData.get("period") as string

  const meter = await db.meter.findUnique({
    where: { id: meterId },
    include: {
      readings: { orderBy: { createdAt: "desc" }, take: 1 },
      space: { include: { tenant: true, floor: true } },
    },
  })
  if (!meter) return { error: "Счётчик не найден" }

  const value = parseFloat(valueStr)
  const previous = meter.readings[0]?.value ?? 0
  const consumption = Math.max(0, value - previous)

  await db.meterReading.create({
    data: { meterId, period, value, previous },
  })

  // Auto-generate electricity charge if tenant exists
  if (meter.space.tenant && consumption > 0) {
    const RATE_PER_KWH = 22 // тенге за кВт·ч
    const amount = Math.round(consumption * RATE_PER_KWH)
    const existing = await db.charge.findFirst({
      where: { tenantId: meter.space.tenant.id, period, type: "ELECTRICITY" },
    })
    if (!existing) {
      await db.charge.create({
        data: {
          tenantId: meter.space.tenant.id,
          period,
          type: "ELECTRICITY",
          amount,
          description: `Электроэнергия: ${consumption} кВт·ч × ${RATE_PER_KWH} ₸`,
          dueDate: new Date(parseInt(period.split("-")[0]), parseInt(period.split("-")[1]) - 1, 10),
        },
      })
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

  await db.meter.create({ data: { spaceId, type, number } })

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
