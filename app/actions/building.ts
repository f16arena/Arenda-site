"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import {
  assertBuildingInOrg,
  assertFloorInOrg,
} from "@/lib/scope-guards"
import { emergencyContactScope } from "@/lib/tenant-scope"
import { assertFloorFitsSpaces } from "@/lib/area-validation"
import { recomputeBuildingArea } from "@/lib/recompute-building-area"
import { normalizeEmail, normalizeKzPhone } from "@/lib/contact-validation"

export async function updateBuilding(buildingId: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  const name = formData.get("name") as string
  const address = formData.get("address") as string
  const description = formData.get("description") as string
  const phone = normalizeKzPhone(formData.get("phone"))
  const email = normalizeEmail(formData.get("email"))
  const responsible = formData.get("responsible") as string

  // totalArea не редактируется вручную — пересчитывается из этажей
  await db.building.update({
    where: { id: buildingId },
    data: {
      name,
      address,
      description: description || null,
      phone,
      email,
      responsible: responsible || null,
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

  const floor = await db.floor.findUnique({
    where: { id: floorId },
    select: { buildingId: true },
  })
  if (!floor) throw new Error("Этаж не найден")

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

  // Building.totalArea = Σ Floor.totalArea
  await recomputeBuildingArea(floor.buildingId)

  revalidatePath("/admin/settings")
  revalidatePath("/admin/spaces")
  revalidatePath("/admin/buildings")
  return { success: true }
}

/**
 * Привязать администратора к зданию. Должен быть User с ролью ADMIN или OWNER
 * из той же организации.
 */
export async function setBuildingAdministrator(buildingId: string, adminUserId: string | null) {
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  if (adminUserId) {
    const user = await db.user.findUnique({
      where: { id: adminUserId },
      select: { id: true, organizationId: true, role: true, isActive: true },
    })
    if (!user) throw new Error("Пользователь не найден")
    if (user.organizationId !== orgId) {
      throw new Error("Пользователь не из вашей организации")
    }
    if (!user.isActive) {
      throw new Error("Пользователь деактивирован — не может быть администратором")
    }
    if (user.role !== "ADMIN" && user.role !== "OWNER") {
      throw new Error(
        `Администратором здания может быть только пользователь с ролью «Админ» или «Владелец». ` +
          `У выбранного пользователя роль: ${user.role}.`,
      )
    }
  }

  await db.building.update({
    where: { id: buildingId },
    data: { administratorUserId: adminUserId },
  })

  revalidatePath("/admin/buildings")
  revalidatePath("/cabinet")
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
  const phone = normalizeKzPhone(formData.get("phone"), { required: true, allowShort: true })

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
  const phone = normalizeKzPhone(formData.get("phone"), { required: true, allowShort: true })
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
