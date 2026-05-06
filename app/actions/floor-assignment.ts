"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireSection } from "@/lib/acl"
import { requireOrgAccess } from "@/lib/org"
import { assertFloorInOrg, assertTenantInOrg } from "@/lib/scope-guards"
import { assertFloorAssignableToOneTenant } from "@/lib/full-floor-guards"

export async function assignFullFloor(floorId: string, tenantId: string, fixedRent: number) {
  await requireSection("tenants", "edit")
  const { orgId } = await requireOrgAccess()
  await assertFloorInOrg(floorId, orgId)
  await assertTenantInOrg(tenantId, orgId)

  if (!Number.isFinite(fixedRent) || fixedRent <= 0) {
    throw new Error("Сумма аренды должна быть больше 0")
  }
  const normalizedFixedRent = Math.round(fixedRent * 100) / 100

  // Этаж должен быть свободен: ни одно помещение не занято и нет другого full-floor арендатора
  await assertFloorAssignableToOneTenant(floorId, tenantId)

  const targetFloor = await db.floor.findUnique({
    where: { id: floorId },
    select: {
      id: true,
      buildingId: true,
      building: { select: { name: true } },
    },
  })
  if (!targetFloor) throw new Error("Этаж не найден")

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      spaceId: true,
      companyName: true,
      space: {
        select: {
          id: true,
          number: true,
          floor: {
            select: {
              id: true,
              buildingId: true,
              fullFloorTenantId: true,
              building: { select: { name: true } },
            },
          },
        },
      },
      tenantSpaces: {
        select: {
          spaceId: true,
          space: {
            select: {
              id: true,
              number: true,
              floor: {
                select: {
                  id: true,
                  buildingId: true,
                  fullFloorTenantId: true,
                  building: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      fullFloors: {
        select: {
          id: true,
          buildingId: true,
          building: { select: { name: true } },
        },
      },
    },
  })
  if (!tenant) throw new Error("Арендатор не найден")

  const currentBuildingIds = [
    tenant.space?.floor.buildingId,
    ...tenant.tenantSpaces.map((item) => item.space.floor.buildingId),
    ...tenant.fullFloors.map((floor) => floor.buildingId),
  ].filter(Boolean)
  const otherBuildingId = currentBuildingIds.find((buildingId) => buildingId !== targetFloor.buildingId)
  if (otherBuildingId) {
    const otherBuildingName =
      tenant.space?.floor.building.name ??
      tenant.tenantSpaces.find((item) => item.space.floor.buildingId === otherBuildingId)?.space.floor.building.name ??
      tenant.fullFloors.find((floor) => floor.buildingId === otherBuildingId)?.building.name ??
      "другое здание"
    throw new Error(
      `Арендатор «${tenant.companyName}» уже привязан к зданию «${otherBuildingName}». ` +
        `Нельзя смешивать этажи из разных зданий. Сначала снимите старую привязку или выберите этаж в том же здании.`,
    )
  }

  const linkedSpaces = [
    tenant.space,
    ...tenant.tenantSpaces.map((item) => item.space),
  ].filter((space): space is NonNullable<typeof tenant.space> => space !== null)
  const oldSpaceIds = [...new Set(linkedSpaces
    .filter((space) => space.floor.id === targetFloor.id)
    .filter((space) => !(space.number === "all" && space.floor.fullFloorTenantId === tenantId))
    .map((space) => space.id))]
  if (oldSpaceIds.length > 0) {
    await db.space.updateMany({
      where: { id: { in: oldSpaceIds } },
      data: { status: "VACANT" },
    })
    await db.tenantSpace.deleteMany({ where: { tenantId, spaceId: { in: oldSpaceIds } } })
    if (tenant.spaceId && oldSpaceIds.includes(tenant.spaceId)) {
      await db.tenant.update({
        where: { id: tenantId },
        data: { spaceId: null },
      })
    }
  }

  await db.floor.update({
    where: { id: floorId },
    data: {
      fullFloorTenantId: tenantId,
      fixedMonthlyRent: normalizedFixedRent,
    },
  })

  // Помечаем все существующие RENTABLE помещения этажа как занятые
  await db.space.updateMany({
    where: { floorId, kind: "RENTABLE" },
    data: { status: "OCCUPIED" },
  })

  // Если на этаже нет арендуемых помещений — автоматически создаём одно
  // «Весь этаж» с площадью = Floor.totalArea и привязываем к нему арендатора.
  // Это нужно чтобы счета/договоры/долги работали через стандартный Space-механизм.
  const rentableCount = await db.space.count({
    where: { floorId, kind: "RENTABLE" },
  })
  if (rentableCount === 0) {
    const floor = await db.floor.findUnique({
      where: { id: floorId },
      select: { totalArea: true, name: true },
    })
    const area = floor?.totalArea ?? 0
    if (area > 0) {
      const space = await db.space.create({
        data: {
          floorId,
          number: "all",
          area,
          status: "OCCUPIED",
          kind: "RENTABLE",
          description: `Весь этаж «${floor?.name ?? ""}» — авто-создано при сдаче целиком`,
        },
        select: { id: true },
      })
      const currentTenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: {
          spaceId: true,
          tenantSpaces: { where: { isPrimary: true }, select: { id: true }, take: 1 },
        },
      })
      const hasPrimary = !!currentTenant?.spaceId || (currentTenant?.tenantSpaces.length ?? 0) > 0
      await db.tenantSpace.create({
        data: { tenantId, spaceId: space.id, isPrimary: !hasPrimary },
      })
      if (!currentTenant?.spaceId) {
        await db.tenant.update({
          where: { id: tenantId },
          data: { spaceId: space.id },
        })
      }
    }
  }

  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath("/admin/tenants")
  revalidatePath("/admin/spaces")
  revalidatePath("/admin/settings")
  revalidatePath(`/admin/floors/${floorId}`)
}

export async function unassignFullFloor(floorId: string) {
  await requireSection("tenants", "edit")
  const { orgId } = await requireOrgAccess()
  await assertFloorInOrg(floorId, orgId)

  // Найдём арендатора, чтобы потом отвязать от auto-space
  const floor = await db.floor.findUnique({
    where: { id: floorId },
    select: { fullFloorTenantId: true },
  })
  const tenantId = floor?.fullFloorTenantId

  await db.floor.update({
    where: { id: floorId },
    data: {
      fullFloorTenantId: null,
      fixedMonthlyRent: null,
    },
  })

  // Если был tenant.spaceId на «авто-этаж» (number="all"), отвязываем
  if (tenantId) {
    const [tenant, autoSpace] = await Promise.all([
      db.tenant.findUnique({
        where: { id: tenantId },
        select: { spaceId: true },
      }),
      db.space.findFirst({
        where: { floorId, number: "all" },
        select: { id: true },
      }),
    ])
    if (autoSpace) {
      await db.tenantSpace.deleteMany({ where: { tenantId, spaceId: autoSpace.id } })
      if (tenant?.spaceId === autoSpace.id) {
        const nextSpace = await db.tenantSpace.findFirst({
          where: { tenantId, spaceId: { not: autoSpace.id } },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: { spaceId: true },
        })
        await db.tenant.update({
          where: { id: tenantId },
          data: { spaceId: nextSpace?.spaceId ?? null },
        })
      }
      await db.space.delete({ where: { id: autoSpace.id } })
    }
  }

  const spaces = await db.space.findMany({
    where: { floorId },
    select: { id: true, tenant: { select: { id: true } }, tenantSpaces: { select: { id: true }, take: 1 } },
  })

  await db.space.updateMany({
    where: {
      id: { in: spaces.filter((s) => !s.tenant && s.tenantSpaces.length === 0).map((s) => s.id) },
    },
    data: { status: "VACANT" },
  })

  revalidatePath("/admin/tenants")
  revalidatePath("/admin/spaces")
  revalidatePath("/admin/settings")
  revalidatePath(`/admin/floors/${floorId}`)
  if (tenantId) revalidatePath(`/admin/tenants/${tenantId}`)
}
