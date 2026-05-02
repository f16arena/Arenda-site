"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { assertFloorInOrg, assertSpaceInOrg } from "@/lib/scope-guards"
import { assertSpaceFitsFloor } from "@/lib/area-validation"

export async function createSpace(formData: FormData) {
  const { orgId } = await requireOrgAccess()
  const floorId = formData.get("floorId") as string
  await assertFloorInOrg(floorId, orgId)

  const number = formData.get("number") as string
  const area = parseFloat(formData.get("area") as string)
  const description = formData.get("description") as string

  if (!Number.isFinite(area) || area <= 0) {
    throw new Error("Введите корректную площадь (м²)")
  }

  // Σ Space.area не может превысить Floor.totalArea
  await assertSpaceFitsFloor({ floorId, newArea: area })

  // Если этаж сдан целиком — новое помещение сразу занято (оно тоже под full-floor арендатором)
  const floor = await db.floor.findUnique({
    where: { id: floorId },
    select: { fullFloorTenantId: true },
  })
  const initialStatus = floor?.fullFloorTenantId ? "OCCUPIED" : "VACANT"

  await db.space.create({
    data: { floorId, number, area, description: description || null, status: initialStatus },
  })

  revalidatePath("/admin/spaces")
  return { success: true }
}

export async function updateSpace(id: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertSpaceInOrg(id, orgId)

  const number = formData.get("number") as string
  const area = parseFloat(formData.get("area") as string)
  const description = formData.get("description") as string
  const status = formData.get("status") as string

  if (!Number.isFinite(area) || area <= 0) {
    throw new Error("Введите корректную площадь (м²)")
  }

  const existing = await db.space.findUnique({
    where: { id },
    select: {
      floorId: true,
      status: true,
      floor: {
        select: {
          fullFloorTenantId: true,
          fullFloorTenant: { select: { companyName: true } },
        },
      },
    },
  })
  if (!existing) throw new Error("Помещение не найдено")

  // Σ Space.area не может превысить Floor.totalArea (исключаем текущий)
  await assertSpaceFitsFloor({ floorId: existing.floorId, newArea: area, excludeSpaceId: id })

  // Если этаж сдан целиком — статус нельзя сменить на VACANT/MAINTENANCE: всегда OCCUPIED
  let finalStatus = status
  if (existing.floor.fullFloorTenantId) {
    if (status !== "OCCUPIED") {
      throw new Error(
        `Этаж сдан целиком арендатору «${existing.floor.fullFloorTenant?.companyName ?? "—"}». ` +
          `Статус помещения нельзя сменить на «${status}» — пока действует договор все помещения этажа OCCUPIED. ` +
          `Сначала снимите арендатора с этажа.`,
      )
    }
    finalStatus = "OCCUPIED"
  }

  await db.space.update({
    where: { id },
    data: { number, area, description: description || null, status: finalStatus },
  })

  revalidatePath("/admin/spaces")
  return { success: true }
}

export async function deleteSpace(id: string) {
  const { orgId } = await requireOrgAccess()
  await assertSpaceInOrg(id, orgId)

  const space = await db.space.findUnique({ where: { id }, include: { tenant: true } })
  if (space?.tenant) return { error: "Нельзя удалить — есть арендатор" }

  await db.space.delete({ where: { id } })
  revalidatePath("/admin/spaces")
  return { success: true }
}

/**
 * Удалить все помещения на этаже (массово). Бросает ошибку, если хотя бы одно занято арендатором.
 * Применяется как «начать с нуля» вместе с очисткой плана.
 */
export async function deleteAllSpacesOnFloor(floorId: string) {
  const { orgId } = await requireOrgAccess()
  await assertFloorInOrg(floorId, orgId)

  const occupied = await db.space.findFirst({
    where: { floorId, tenant: { isNot: null } },
    select: {
      number: true,
      tenant: { select: { companyName: true } },
    },
  })
  if (occupied) {
    throw new Error(
      `Нельзя удалить все помещения — кабинет ${occupied.number} занят арендатором «${occupied.tenant?.companyName ?? "—"}». Сначала выселите арендатора.`,
    )
  }

  const result = await db.space.deleteMany({ where: { floorId } })

  revalidatePath("/admin/spaces")
  revalidatePath("/admin/buildings")
  revalidatePath(`/admin/floors/${floorId}`)
  return { success: true, count: result.count }
}
