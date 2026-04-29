"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOwner, requireAdmin } from "@/lib/permissions"
import { setCurrentBuildingCookie } from "@/lib/current-building"
import { requireOrgAccess, checkLimit } from "@/lib/org"
import { assertBuildingInOrg, assertFloorInOrg } from "@/lib/scope-guards"

export async function createBuilding(formData: FormData) {
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  await checkLimit(orgId, "buildings")

  const name = String(formData.get("name") ?? "").trim()
  const address = String(formData.get("address") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const phone = String(formData.get("phone") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
  const responsible = String(formData.get("responsible") ?? "").trim()
  const totalAreaStr = String(formData.get("totalArea") ?? "")
  const contractPrefix = String(formData.get("contractPrefix") ?? "").trim().toUpperCase()

  if (!name) throw new Error("Название обязательно")
  if (!address) throw new Error("Адрес обязателен")

  const building = await db.building.create({
    data: {
      organizationId: orgId,
      name,
      address,
      description: description || null,
      phone: phone || null,
      email: email || null,
      responsible: responsible || null,
      totalArea: totalAreaStr ? parseFloat(totalAreaStr) : null,
      contractPrefix: contractPrefix || null,
    },
  })

  await setCurrentBuildingCookie(building.id)

  revalidatePath("/admin/buildings")
  revalidatePath("/admin")
  return { id: building.id }
}

export async function updateBuildingDetails(buildingId: string, formData: FormData) {
  await requireAdmin()
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  const name = String(formData.get("name") ?? "").trim()
  const address = String(formData.get("address") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const phone = String(formData.get("phone") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
  const responsible = String(formData.get("responsible") ?? "").trim()
  const totalAreaStr = String(formData.get("totalArea") ?? "")
  const contractPrefix = String(formData.get("contractPrefix") ?? "").trim().toUpperCase()

  await db.building.update({
    where: { id: buildingId },
    data: {
      name,
      address,
      description: description || null,
      phone: phone || null,
      email: email || null,
      responsible: responsible || null,
      totalArea: totalAreaStr ? parseFloat(totalAreaStr) : null,
      contractPrefix: contractPrefix || null,
    },
  })

  revalidatePath("/admin/buildings")
  revalidatePath("/admin/settings")
}

export async function toggleBuildingActive(buildingId: string, isActive: boolean) {
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  await db.building.update({
    where: { id: buildingId },
    data: { isActive },
  })

  revalidatePath("/admin/buildings")
}

export async function deleteBuilding(buildingId: string) {
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  const floorsWithSpaces = await db.floor.count({ where: { buildingId } })
  if (floorsWithSpaces > 0) {
    throw new Error("Нельзя удалить — у здания есть этажи и помещения. Сначала удалите их или просто деактивируйте здание.")
  }

  await db.building.delete({ where: { id: buildingId } })

  revalidatePath("/admin/buildings")
}

export async function switchBuilding(buildingId: string) {
  // Переключаться можно только на здание из своей организации
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  await setCurrentBuildingCookie(buildingId)

  revalidatePath("/admin", "layout")
}

export async function createFloor(buildingId: string, formData: FormData) {
  await requireAdmin()
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  const numberStr = String(formData.get("number") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const ratePerSqmStr = String(formData.get("ratePerSqm") ?? "")
  const totalAreaStr = String(formData.get("totalArea") ?? "")

  if (!name) throw new Error("Название этажа обязательно")
  const number = parseInt(numberStr)
  if (Number.isNaN(number)) throw new Error("Номер этажа должен быть числом")

  await db.floor.create({
    data: {
      buildingId,
      number,
      name,
      ratePerSqm: ratePerSqmStr ? parseFloat(ratePerSqmStr) : 0,
      totalArea: totalAreaStr ? parseFloat(totalAreaStr) : null,
    },
  })

  revalidatePath("/admin/buildings")
  revalidatePath("/admin/settings")
  revalidatePath("/admin/spaces")
}

export async function deleteFloor(floorId: string) {
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  await assertFloorInOrg(floorId, orgId)

  const spaceCount = await db.space.count({ where: { floorId } })
  if (spaceCount > 0) {
    throw new Error("Нельзя удалить — на этаже есть помещения. Сначала удалите их.")
  }

  await db.floor.delete({ where: { id: floorId } })

  revalidatePath("/admin/buildings")
  revalidatePath("/admin/settings")
  revalidatePath("/admin/spaces")
}
