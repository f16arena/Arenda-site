"use server"

import { db } from "@/lib/db"
import { revalidatePath, revalidateTag } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import {
  assertBuildingInOrg,
  assertFloorInOrg,
} from "@/lib/scope-guards"
import { emergencyContactScope } from "@/lib/tenant-scope"
import { assertFloorFitsSpaces } from "@/lib/area-validation"
import { recomputeBuildingArea } from "@/lib/recompute-building-area"
import { normalizeEmailWithDns, normalizeKzPhone } from "@/lib/contact-validation"
import { isStaffScopedRole } from "@/lib/building-access"
import { ADMIN_SHELL_CACHE_TAG } from "@/lib/admin-shell-cache"
import { requireCapabilityAndFeature } from "@/lib/capabilities"

export async function updateBuilding(buildingId: string, formData: FormData) {
  await requireCapabilityAndFeature("buildings.edit")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  const name = String(formData.get("name") ?? "").trim()
  const address = String(formData.get("address") ?? "").trim()
  const addressFields = readAddressFields(formData)
  const description = String(formData.get("description") ?? "").trim()
  const phone = normalizeKzPhone(formData.get("phone"))
  const email = await normalizeEmailWithDns(formData.get("email"), { fieldName: "Email здания" })
  const responsible = String(formData.get("responsible") ?? "").trim()

  if (!name) throw new Error("Название здания обязательно")
  if (!address) throw new Error("Адрес здания обязателен")

  // totalArea не редактируется вручную — пересчитывается из этажей
  await db.building.update({
    where: { id: buildingId },
    data: {
      name,
      address,
      ...addressFields,
      description: description || null,
      phone,
      email,
      responsible: responsible || null,
    },
  })

  revalidatePath("/admin/settings")
  revalidatePath("/admin/spaces")
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  return { success: true }
}

function readAddressFields(formData: FormData) {
  return {
    addressCountryCode: readOptionalString(formData, "addressCountryCode") ?? "kz",
    addressRegion: readOptionalString(formData, "addressRegion"),
    addressCity: readOptionalString(formData, "addressCity"),
    addressSettlement: readOptionalString(formData, "addressSettlement"),
    addressStreet: readOptionalString(formData, "addressStreet"),
    addressHouseNumber: readOptionalString(formData, "addressHouseNumber"),
    addressPostcode: readOptionalString(formData, "addressPostcode"),
    addressLatitude: readOptionalNumber(formData, "addressLatitude"),
    addressLongitude: readOptionalNumber(formData, "addressLongitude"),
    addressSource: readOptionalString(formData, "addressSource"),
    addressSourceId: readOptionalString(formData, "addressSourceId"),
  }
}

function readOptionalString(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim()
  return value || null
}

function readOptionalNumber(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim()
  if (!value) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export async function updateFloor(floorId: string, formData: FormData) {
  await requireCapabilityAndFeature("floors.create")
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
  await requireCapabilityAndFeature("buildings.edit")
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
  if (adminUserId) {
    const user = await db.user.findUnique({
      where: { id: adminUserId },
      select: { role: true },
    })
    if (user && isStaffScopedRole(user.role)) {
      await db.userBuildingAccess.upsert({
        where: { userId_buildingId: { userId: adminUserId, buildingId } },
        create: { userId: adminUserId, buildingId },
        update: {},
      })
    }
  }

  revalidatePath("/admin/buildings")
  revalidatePath("/cabinet")
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
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
