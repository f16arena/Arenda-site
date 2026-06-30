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
import { ADMIN_SHELL_CACHE_TAG, buildingsForOrgTag, floorsForBuildingTag } from "@/lib/admin-shell-cache"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { BuildingUpdateSchema, FloorUpdateSchema, firstZodError } from "@/lib/schemas"

// Возвращаем ошибку вместо throw: в проде Next затирает текст брошенных из
// server action ошибок, а возвращённые значения отдаёт как есть. ServerForm
// показывает result.error в тосте — пользователь видит реальную причину.
function fail(error: unknown) {
  return {
    success: false as const,
    error: error instanceof Error ? error.message : "Не удалось сохранить",
  }
}

export async function updateBuilding(buildingId: string, formData: FormData) {
  try {
  await requireCapabilityAndFeature("buildings.edit")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  // Валидация формата (Zod) выполняется до нормализации.
  // Нормализация (normalizeKzPhone / normalizeEmailWithDns) происходит после
  // — она может ходить в DNS и возвращать нормализованные значения, поэтому
  // её результат и используется при записи в БД.
  const rawPhone = formData.get("phone")
  const rawEmail = formData.get("email")
  const parsed = BuildingUpdateSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address"),
    phone: typeof rawPhone === "string" ? rawPhone : "",
    email: typeof rawEmail === "string" ? rawEmail : "",
    responsible: formData.get("responsible"),
    description: formData.get("description"),
  })
  if (!parsed.success) throw new Error(firstZodError(parsed.error))

  const name = parsed.data.name
  const address = String(formData.get("address") ?? "").trim()
  const addressFields = readAddressFields(formData)
  const description = String(formData.get("description") ?? "").trim()
  const phone = normalizeKzPhone(formData.get("phone"))
  const email = await normalizeEmailWithDns(formData.get("email"), { fieldName: "Email здания" })
  const responsible = String(formData.get("responsible") ?? "").trim()
  // Адрес для документов — необязательный override обычного адреса. Используется
  // в договорах/актах когда геокодер вернул адрес на казахском («Шығыс Қазақстан
  // облысы»), а в документ нужно по-русски. Пустая строка → null (использовать обычный).
  const documentAddress = String(formData.get("documentAddress") ?? "").trim()
  // Услуги включённые в эксп. сбор — массив чекбоксов name="utilities_in_service_fee".
  // Sentinel `utilities_in_service_fee_form=1` помечает что форма управляет
  // этим полем (иначе не трогаем — другая форма может его не иметь).
  let utilitiesInServiceFee: string | null | undefined
  if (formData.get("utilities_in_service_fee_form") === "1") {
    const values = formData.getAll("utilities_in_service_fee").map(String)
    utilitiesInServiceFee = (await import("@/lib/service-charges")).serializeUtilitiesInServiceFee(values)
  }

  if (!address) throw new Error("Адрес здания обязателен")

  // totalArea не редактируется вручную — пересчитывается из этажей
  await db.building.update({
    where: { id: buildingId },
    data: {
      name,
      address,
      ...addressFields,
      documentAddress: documentAddress || null,
      ...(utilitiesInServiceFee !== undefined ? { utilitiesInServiceFee } : {}),
      description: description || null,
      phone,
      email,
      responsible: responsible || null,
    },
  })

  revalidatePath("/admin/settings")
  revalidatePath("/admin/spaces")
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  revalidateTag(buildingsForOrgTag(orgId), { expire: 0 })
  return { success: true }
  } catch (e) {
    return fail(e)
  }
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
  await requireCapabilityAndFeature("floors.edit")
  const { orgId } = await requireOrgAccess()
  await assertFloorInOrg(floorId, orgId)

  const rateRaw = String(formData.get("ratePerSqm") ?? "").trim()
  const areaRaw = String(formData.get("totalArea") ?? "").trim()
  const parsed = FloorUpdateSchema.safeParse({
    name: formData.get("name"),
    ratePerSqm: rateRaw ? Number(rateRaw) : 0,
    totalArea: areaRaw ? Number(areaRaw) : null,
  })
  if (!parsed.success) throw new Error(firstZodError(parsed.error))
  const { name, ratePerSqm, totalArea: newTotalArea } = parsed.data

  const floor = await db.floor.findUnique({
    where: { id: floorId },
    select: { buildingId: true },
  })
  if (!floor) throw new Error("Этаж не найден")

  // Floor.totalArea не может быть меньше Σ Space.area
  await assertFloorFitsSpaces({ floorId, newTotalArea: newTotalArea ?? null })

  await db.floor.update({
    where: { id: floorId },
    data: {
      name,
      ratePerSqm,
      totalArea: newTotalArea ?? null,
    },
  })

  // Building.totalArea = Σ Floor.totalArea
  await recomputeBuildingArea(floor.buildingId)

  revalidatePath("/admin/settings")
  revalidatePath("/admin/spaces")
  revalidatePath("/admin/buildings")
  revalidateTag(floorsForBuildingTag(floor.buildingId), { expire: 0 })
  revalidateTag(buildingsForOrgTag(orgId), { expire: 0 })
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
  revalidateTag(buildingsForOrgTag(orgId), { expire: 0 })
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
