"use server"

import { db } from "@/lib/db"
import { revalidatePath, revalidateTag } from "next/cache"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { setCurrentBuildingCookie } from "@/lib/current-building"
import { ALL_BUILDINGS_COOKIE, assertBuildingAccess } from "@/lib/building-access"
import { requireOrgAccess, checkLimit } from "@/lib/org"
import { assertBuildingInOrg, assertFloorInOrg } from "@/lib/scope-guards"
import { recomputeBuildingArea } from "@/lib/recompute-building-area"
import { normalizeFloorKind } from "@/lib/zone-kinds"
import { normalizeEmailWithDns, normalizeKzPhone } from "@/lib/contact-validation"
import { ADMIN_SHELL_CACHE_TAG, buildingsForOrgTag, floorsForBuildingTag } from "@/lib/admin-shell-cache"

export async function createBuilding(formData: FormData) {
  await requireCapabilityAndFeature("buildings.create")
  const { orgId } = await requireOrgAccess()
  await checkLimit(orgId, "buildings")

  const name = String(formData.get("name") ?? "").trim()
  const address = String(formData.get("address") ?? "").trim()
  const addressFields = readAddressFields(formData)
  const description = String(formData.get("description") ?? "").trim()
  const phone = normalizeKzPhone(formData.get("phone"))
  const email = await normalizeEmailWithDns(formData.get("email"), { fieldName: "Email здания" })
  const responsible = String(formData.get("responsible") ?? "").trim()
  const contractPrefix = String(formData.get("contractPrefix") ?? "").trim().toUpperCase()

  if (!name) throw new Error("Название обязательно")
  if (!address) throw new Error("Адрес обязателен")

  const building = await db.building.create({
    data: {
      organizationId: orgId,
      name,
      address,
      ...addressFields,
      description: description || null,
      phone,
      email,
      responsible: responsible || null,
      // totalArea не задаётся при создании — будет пересчитана из этажей
      contractPrefix: contractPrefix || null,
    },
  })

  await setCurrentBuildingCookie(building.id)

  revalidatePath("/admin/buildings")
  revalidatePath("/admin")
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  revalidateTag(buildingsForOrgTag(orgId), { expire: 0 })
  return { id: building.id }
}

export async function updateBuildingDetails(buildingId: string, formData: FormData) {
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
  const contractPrefix = String(formData.get("contractPrefix") ?? "").trim().toUpperCase()

  if (!name) throw new Error("Название обязательно")
  if (!address) throw new Error("Адрес обязателен")

  // totalArea больше не редактируется вручную — она рассчитывается автоматически
  // из суммы Floor.totalArea (см. recomputeBuildingArea в floor-actions).
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
      contractPrefix: contractPrefix || null,
    },
  })

  revalidatePath("/admin/buildings")
  revalidatePath("/admin/settings")
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  revalidateTag(buildingsForOrgTag(orgId), { expire: 0 })
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

export async function toggleBuildingActive(buildingId: string, isActive: boolean) {
  await requireCapabilityAndFeature("buildings.toggle")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  await db.building.update({
    where: { id: buildingId },
    data: { isActive },
  })

  revalidatePath("/admin/buildings")
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  revalidateTag(buildingsForOrgTag(orgId), { expire: 0 })
}

export async function deleteBuilding(buildingId: string) {
  await requireCapabilityAndFeature("buildings.delete")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  const floorsWithSpaces = await db.floor.count({ where: { buildingId } })
  if (floorsWithSpaces > 0) {
    throw new Error("Нельзя удалить — у здания есть этажи и помещения. Сначала удалите их или просто деактивируйте здание.")
  }

  await db.building.delete({ where: { id: buildingId } })

  revalidatePath("/admin/buildings")
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  revalidateTag(buildingsForOrgTag(orgId), { expire: 0 })
  revalidateTag(floorsForBuildingTag(buildingId), { expire: 0 })
}

export async function switchBuilding(buildingId: string) {
  // Переключаться можно только на здание из своей организации
  const { orgId } = await requireOrgAccess()
  if (!buildingId || buildingId === ALL_BUILDINGS_COOKIE) {
    await setCurrentBuildingCookie(ALL_BUILDINGS_COOKIE)
    revalidatePath("/admin", "layout")
    return
  }
  await assertBuildingInOrg(buildingId, orgId)
  await assertBuildingAccess(buildingId, orgId)

  await setCurrentBuildingCookie(buildingId)

  revalidatePath("/admin", "layout")
}

export async function createFloor(buildingId: string, formData: FormData) {
  await requireCapabilityAndFeature("floors.create")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  const numberStr = String(formData.get("number") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const ratePerSqmStr = String(formData.get("ratePerSqm") ?? "")
  const totalAreaStr = String(formData.get("totalArea") ?? "")
  // FLOOR — обычный этаж; ROOF — крыша; TERRITORY — прилегающая территория.
  // Крыша и территория — «зоны»: не входят в площадь здания, сдаются объектами без м².
  const kind = normalizeFloorKind(formData.get("kind") as string | null)

  if (!name) throw new Error("Название этажа обязательно")
  const number = parseInt(numberStr)
  if (Number.isNaN(number)) throw new Error("Номер этажа должен быть числом")

  const newTotalArea = totalAreaStr ? parseFloat(totalAreaStr) : null

  await db.floor.create({
    data: {
      buildingId,
      number,
      name,
      kind,
      ratePerSqm: ratePerSqmStr ? parseFloat(ratePerSqmStr) : 0,
      totalArea: newTotalArea,
    },
  })

  // Building.totalArea = Σ Floor.totalArea
  await recomputeBuildingArea(buildingId)

  revalidatePath("/admin/buildings")
  revalidatePath("/admin/settings")
  revalidatePath("/admin/spaces")
  revalidateTag(floorsForBuildingTag(buildingId), { expire: 0 })
  revalidateTag(buildingsForOrgTag(orgId), { expire: 0 })
}

/**
 * Удалить этаж. По умолчанию запрещает удаление при наличии помещений.
 * Если cascade=true — также удаляет все помещения, но только если ни одно не занято арендатором.
 */
export async function deleteFloor(floorId: string, opts?: { cascade?: boolean }) {
  await requireCapabilityAndFeature("floors.delete")
  const { orgId } = await requireOrgAccess()
  await assertFloorInOrg(floorId, orgId)

  const spaceCount = await db.space.count({ where: { floorId } })
  if (spaceCount > 0) {
    if (!opts?.cascade) {
      throw new Error(
        `Нельзя удалить — на этаже ${spaceCount} помещени${spaceCount === 1 ? "е" : spaceCount < 5 ? "я" : "й"}. ` +
          `Удалите помещения вручную или используйте каскадное удаление.`,
      )
    }
    // cascade: проверяем что нет занятых — учитываем И legacy space.tenant,
    // И современный tenantSpaces (раньше занятые через tenantSpaces помещения
    // молча удалялись вместе с этажом — потеря данных).
    const occupied = await db.space.findFirst({
      where: {
        floorId,
        OR: [
          { tenant: { isNot: null } },
          { tenantSpaces: { some: {} } },
        ],
      },
      select: {
        number: true,
        tenant: { select: { companyName: true } },
        tenantSpaces: { select: { tenant: { select: { companyName: true } } }, take: 1 },
      },
    })
    if (occupied) {
      const company = occupied.tenant?.companyName ?? occupied.tenantSpaces[0]?.tenant?.companyName ?? "—"
      throw new Error(
        `Нельзя удалить — кабинет ${occupied.number} занят арендатором «${company}». Сначала выселите.`,
      )
    }
    // Этаж, сданный целиком, тоже нельзя каскадно удалять.
    const fullFloor = await db.floor.findUnique({
      where: { id: floorId },
      select: { fullFloorTenantId: true },
    })
    if (fullFloor?.fullFloorTenantId) {
      throw new Error("Нельзя удалить — этаж сдан целиком. Сначала освободите этаж.")
    }
    await db.space.deleteMany({ where: { floorId } })
  }

  // Сохраним buildingId до удаления для пересчёта площади
  const floor = await db.floor.findUnique({
    where: { id: floorId },
    select: { buildingId: true },
  })

  await db.floor.delete({ where: { id: floorId } })

  if (floor) await recomputeBuildingArea(floor.buildingId)

  revalidatePath("/admin/buildings")
  revalidatePath("/admin/settings")
  revalidatePath("/admin/spaces")
  if (floor) {
    revalidateTag(floorsForBuildingTag(floor.buildingId), { expire: 0 })
    revalidateTag(buildingsForOrgTag(orgId), { expire: 0 })
  }
}
