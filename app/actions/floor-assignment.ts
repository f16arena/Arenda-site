"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/permissions"
import { requireOrgAccess } from "@/lib/org"
import { assertFloorInOrg, assertTenantInOrg } from "@/lib/scope-guards"

export async function assignFullFloor(floorId: string, tenantId: string, fixedRent: number) {
  await requireAdmin()
  const { orgId } = await requireOrgAccess()
  await assertFloorInOrg(floorId, orgId)
  await assertTenantInOrg(tenantId, orgId)

  if (fixedRent <= 0) throw new Error("Сумма аренды должна быть больше 0")

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, spaceId: true },
  })
  if (!tenant) throw new Error("Арендатор не найден")

  if (tenant.spaceId) {
    await db.space.update({
      where: { id: tenant.spaceId },
      data: { status: "VACANT" },
    })
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

  await db.space.updateMany({
    where: { floorId },
    data: { status: "OCCUPIED" },
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath("/admin/tenants")
  revalidatePath("/admin/spaces")
  revalidatePath("/admin/settings")
}

export async function unassignFullFloor(floorId: string) {
  await requireAdmin()
  const { orgId } = await requireOrgAccess()
  await assertFloorInOrg(floorId, orgId)

  await db.floor.update({
    where: { id: floorId },
    data: {
      fullFloorTenantId: null,
      fixedMonthlyRent: null,
    },
  })

  const spaces = await db.space.findMany({
    where: { floorId },
    select: { id: true, tenant: { select: { id: true } } },
  })

  await db.space.updateMany({
    where: {
      id: { in: spaces.filter((s) => !s.tenant).map((s) => s.id) },
    },
    data: { status: "VACANT" },
  })

  revalidatePath("/admin/tenants")
  revalidatePath("/admin/spaces")
  revalidatePath("/admin/settings")
}
