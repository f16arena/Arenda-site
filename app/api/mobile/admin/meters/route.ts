import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { mobileError } from "@/lib/mobile-context"
import { getMobileStaffRequest } from "@/lib/mobile-admin"

export const dynamic = "force-dynamic"

const METER_TYPES = new Set(["ELECTRICITY", "WATER", "HEAT"])

export async function GET(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const { buildingIds } = result
  const url = new URL(req.url)
  const spaceId = url.searchParams.get("spaceId")?.trim()
  const buildingFilter = url.searchParams.get("buildingId")?.trim()

  if (buildingIds.length === 0) {
    return NextResponse.json({ data: [] })
  }

  const targetBuildings = buildingFilter
    ? buildingIds.filter((id) => id === buildingFilter)
    : buildingIds

  if (targetBuildings.length === 0) {
    return mobileError("Здание недоступно", 403)
  }

  const where: Record<string, unknown> = {
    space: { floor: { buildingId: { in: targetBuildings } } },
  }
  if (spaceId) where.spaceId = spaceId

  const meters = await db.meter.findMany({
    where,
    select: {
      id: true,
      type: true,
      number: true,
      space: {
        select: {
          id: true,
          number: true,
          area: true,
          floor: { select: { id: true, name: true, buildingId: true, building: { select: { id: true, name: true } } } },
        },
      },
      readings: {
        orderBy: { createdAt: "desc" },
        take: 2,
        select: { id: true, value: true, previous: true, period: true, createdAt: true },
      },
    },
    orderBy: [{ space: { number: "asc" } }, { type: "asc" }],
    take: 100,
  })

  return NextResponse.json({ data: meters })
}

export async function POST(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const { buildingIds } = result
  const body = (await req.json().catch(() => null)) as {
    spaceId?: string
    type?: string
    number?: string
    initialValue?: number
  } | null

  const spaceId = body?.spaceId?.trim()
  const type = body?.type?.trim().toUpperCase()
  const number = body?.number?.trim()
  if (!spaceId) return mobileError("Укажите помещение")
  if (!type || !METER_TYPES.has(type)) return mobileError("Выберите корректный тип счётчика")
  if (!number) return mobileError("Укажите номер счётчика")

  const space = await db.space.findFirst({
    where: { id: spaceId, floor: { buildingId: { in: buildingIds } } },
    select: { id: true },
  })
  if (!space) return mobileError("Помещение недоступно", 403)

  const meter = await db.meter.create({
    data: { spaceId, type, number },
    select: { id: true, type: true, number: true, spaceId: true },
  })

  if (body?.initialValue !== undefined && body.initialValue !== null) {
    const initial = Number(body.initialValue)
    if (!Number.isFinite(initial) || initial < 0) {
      return mobileError("Начальное показание должно быть неотрицательным")
    }
    if (initial > 0) {
      const period = new Date().toISOString().slice(0, 7)
      await db.meterReading.create({
        data: { meterId: meter.id, period, value: initial, previous: 0 },
      })
    }
  }

  return NextResponse.json({ data: meter }, { status: 201 })
}

export async function DELETE(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const { buildingIds } = result
  const url = new URL(req.url)
  const id = url.searchParams.get("id")?.trim()
  if (!id) return mobileError("Не указан id счётчика")

  const meter = await db.meter.findFirst({
    where: { id, space: { floor: { buildingId: { in: buildingIds } } } },
    select: { id: true },
  })
  if (!meter) return mobileError("Счётчик не найден", 404)

  const [readings] = await db.$transaction([
    db.meterReading.deleteMany({ where: { meterId: id } }),
    db.meter.delete({ where: { id } }),
  ])

  return NextResponse.json({ ok: true, readingsDeleted: readings.count })
}
