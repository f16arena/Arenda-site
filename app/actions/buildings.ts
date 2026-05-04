"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOwner, requireAdmin } from "@/lib/permissions"
import { setCurrentBuildingCookie } from "@/lib/current-building"
import { ALL_BUILDINGS_COOKIE, assertBuildingAccess } from "@/lib/building-access"
import { requireOrgAccess, checkLimit } from "@/lib/org"
import { assertBuildingInOrg, assertFloorInOrg } from "@/lib/scope-guards"
import { recomputeBuildingArea } from "@/lib/recompute-building-area"
import { normalizeEmailWithDns, normalizeKzPhone } from "@/lib/contact-validation"

export async function createBuilding(formData: FormData) {
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  await checkLimit(orgId, "buildings")

  const name = String(formData.get("name") ?? "").trim()
  const address = String(formData.get("address") ?? "").trim()
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
  return { id: building.id }
}

export async function updateBuildingDetails(buildingId: string, formData: FormData) {
  await requireAdmin()
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  const name = String(formData.get("name") ?? "").trim()
  const address = String(formData.get("address") ?? "").trim()
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
      description: description || null,
      phone,
      email,
      responsible: responsible || null,
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

  const newTotalArea = totalAreaStr ? parseFloat(totalAreaStr) : null

  await db.floor.create({
    data: {
      buildingId,
      number,
      name,
      ratePerSqm: ratePerSqmStr ? parseFloat(ratePerSqmStr) : 0,
      totalArea: newTotalArea,
    },
  })

  // Building.totalArea = Σ Floor.totalArea
  await recomputeBuildingArea(buildingId)

  revalidatePath("/admin/buildings")
  revalidatePath("/admin/settings")
  revalidatePath("/admin/spaces")
}

/**
 * Удалить этаж. По умолчанию запрещает удаление при наличии помещений.
 * Если cascade=true — также удаляет все помещения, но только если ни одно не занято арендатором.
 */
export async function deleteFloor(floorId: string, opts?: { cascade?: boolean }) {
  await requireOwner()
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
    // cascade: проверяем что нет занятых
    const occupied = await db.space.findFirst({
      where: { floorId, tenant: { isNot: null } },
      select: { number: true, tenant: { select: { companyName: true } } },
    })
    if (occupied) {
      throw new Error(
        `Нельзя удалить — кабинет ${occupied.number} занят арендатором «${occupied.tenant?.companyName ?? "—"}». Сначала выселите.`,
      )
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
}
