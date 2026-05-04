"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/permissions"
import { requireOrgAccess } from "@/lib/org"
import { assertFloorInOrg, assertTenantInOrg } from "@/lib/scope-guards"
import { assertFloorAssignableToOneTenant } from "@/lib/full-floor-guards"

export async function assignFullFloor(floorId: string, tenantId: string, fixedRent: number) {
  await requireAdmin()
  const { orgId } = await requireOrgAccess()
  await assertFloorInOrg(floorId, orgId)
  await assertTenantInOrg(tenantId, orgId)

  if (fixedRent <= 0) throw new Error("Сумма аренды должна быть больше 0")

  // Этаж должен быть свободен: ни одно помещение не занято и нет другого full-floor арендатора
  await assertFloorAssignableToOneTenant(floorId)

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, spaceId: true, tenantSpaces: { select: { spaceId: true } } },
  })
  if (!tenant) throw new Error("Арендатор не найден")

  // Освобождаем старые помещения арендатора, если были
  const oldSpaceIds = [...new Set([
    tenant.spaceId,
    ...tenant.tenantSpaces.map((item) => item.spaceId),
  ].filter(Boolean) as string[])]
  if (oldSpaceIds.length > 0) {
    await db.space.updateMany({
      where: { id: { in: oldSpaceIds } },
      data: { status: "VACANT" },
    })
    await db.tenantSpace.deleteMany({ where: { tenantId } })
    await db.tenant.update({
      where: { id: tenantId },
      data: { spaceId: null },
    })
  }

  await db.floor.update({
    where: { id: floorId },
    data: {
      fullFloorTenantId: tenantId,
      fixedMonthlyRent: fixedRent,
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
      await db.tenant.update({
        where: { id: tenantId },
        data: { spaceId: space.id },
      })
      await db.tenantSpace.create({
        data: { tenantId, spaceId: space.id, isPrimary: true },
      })
    }
  }

  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath("/admin/tenants")
  revalidatePath("/admin/spaces")
  revalidatePath("/admin/settings")
  revalidatePath(`/admin/floors/${floorId}`)
}

export async function unassignFullFloor(floorId: string) {
  await requireAdmin()
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
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { spaceId: true },
    })
    if (tenant?.spaceId) {
      const sp = await db.space.findUnique({
        where: { id: tenant.spaceId },
        select: { number: true, floorId: true },
      })
      if (sp?.number === "all" && sp.floorId === floorId) {
        // Это авто-созданное «весь этаж» — просто удалим, чтобы вернуть этаж в чистое состояние
        await db.tenantSpace.deleteMany({ where: { spaceId: tenant.spaceId } })
        await db.tenant.update({
          where: { id: tenantId },
          data: { spaceId: null },
        })
        await db.space.delete({ where: { id: tenant.spaceId } })
      }
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
}
