"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import {
  assertBuildingInOrg,
  assertFloorInOrg,
} from "@/lib/scope-guards"
import { emergencyContactScope } from "@/lib/tenant-scope"
import {
  assertBuildingFitsFloors,
  assertFloorFitsBuilding,
  assertFloorFitsSpaces,
} from "@/lib/area-validation"

export async function updateBuilding(buildingId: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  const name = formData.get("name") as string
  const address = formData.get("address") as string
  const description = formData.get("description") as string
  const phone = formData.get("phone") as string
  const email = formData.get("email") as string
  const responsible = formData.get("responsible") as string
  const totalAreaStr = formData.get("totalArea") as string

  const newTotalArea = totalAreaStr ? parseFloat(totalAreaStr) : null
  // Нельзя задать площадь здания меньше суммы площадей этажей
  await assertBuildingFitsFloors({ buildingId, newTotalArea })

  await db.building.update({
    where: { id: buildingId },
    data: {
      name,
      address,
      description: description || null,
      phone: phone || null,
      email: email || null,
      responsible: responsible || null,
      totalArea: newTotalArea,
    },
  })

  revalidatePath("/admin/settings")
  revalidatePath("/admin/spaces")
  return { success: true }
}

export async function updateFloor(floorId: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertFloorInOrg(floorId, orgId)

  const name = formData.get("name") as string
  const rateStr = formData.get("ratePerSqm") as string
  const areaStr = formData.get("totalArea") as string

  const newTotalArea = areaStr ? parseFloat(areaStr) : null

  // Найти buildingId для проверки вверх + проверка вниз
  const floor = await db.floor.findUnique({
    where: { id: floorId },
    select: { buildingId: true },
  })
  if (!floor) throw new Error("Этаж не найден")

  // Σ Floor.totalArea (исключая текущий) + new ≤ Building.totalArea
  await assertFloorFitsBuilding({
    buildingId: floor.buildingId,
    newTotalArea,
    excludeFloorId: floorId,
  })
  // Floor.totalArea не может быть меньше Σ Space.area
  await assertFloorFitsSpaces({ floorId, newTotalArea })

  await db.floor.update({
    where: { id: floorId },
    data: {
      name,
      ratePerSqm: rateStr ? parseFloat(rateStr) : 0,
      totalArea: newTotalArea,
    },
  })

  revalidatePath("/admin/settings")
  revalidatePath("/admin/spaces")
  return { success: true }
}

async function assertEmergencyContactInOrg(id: string, orgId: string) {
  const found = await db.emergencyContact.findFirst({
    where: { id, ...emergencyContactScope(orgId) },
    select: { id: true },
  })
  if (!found) throw new Error("Контакт не найден или нет доступа")
}

export async function updateEmergencyContact(id: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertEmergencyContactInOrg(id, orgId)

  const name = formData.get("name") as string
  const phone = formData.get("phone") as string

  await db.emergencyContact.update({
    where: { id },
    data: { name, phone },
  })

  revalidatePath("/admin/settings")
  revalidatePath("/admin/emergency")
  return { success: true }
}

export async function addEmergencyContact(buildingId: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  const name = formData.get("name") as string
  const phone = formData.get("phone") as string
  const category = formData.get("category") as string

  await db.emergencyContact.create({
    data: { buildingId, name, phone, category },
  })

  revalidatePath("/admin/settings")
  revalidatePath("/admin/emergency")
  return { success: true }
}

export async function deleteEmergencyContact(id: string) {
  const { orgId } = await requireOrgAccess()
  await assertEmergencyContactInOrg(id, orgId)

  await db.emergencyContact.delete({ where: { id } })
  revalidatePath("/admin/settings")
  revalidatePath("/admin/emergency")
  return { success: true }
}
