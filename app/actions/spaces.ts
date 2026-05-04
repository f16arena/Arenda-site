"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { assertFloorInOrg, assertSpaceInOrg, assertBuildingInOrg } from "@/lib/scope-guards"
import { assertSpaceFitsFloor } from "@/lib/area-validation"

export async function createSpace(formData: FormData) {
  const { orgId } = await requireOrgAccess()
  const floorId = formData.get("floorId") as string
  await assertFloorInOrg(floorId, orgId)

  const number = formData.get("number") as string
  const area = parseFloat(formData.get("area") as string)
  const description = formData.get("description") as string
  // RENTABLE = можно сдать, COMMON = коридор/WC/лестница (не сдаётся)
  const kindRaw = String(formData.get("kind") ?? "RENTABLE").toUpperCase()
  const kind = kindRaw === "COMMON" ? "COMMON" : "RENTABLE"

  if (!Number.isFinite(area) || area <= 0) {
    throw new Error("Введите корректную площадь (м²)")
  }

  // Σ Space.area не может превысить Floor.totalArea
  await assertSpaceFitsFloor({ floorId, newArea: area })

  // Если этаж сдан целиком — новое помещение сразу занято (оно тоже под full-floor арендатором).
  // Для COMMON помещений всегда VACANT (они вообще не "сдаваемые").
  const floor = await db.floor.findUnique({
    where: { id: floorId },
    select: { fullFloorTenantId: true },
  })
  const initialStatus =
    kind === "COMMON" ? "VACANT" : floor?.fullFloorTenantId ? "OCCUPIED" : "VACANT"

  await db.space.create({
    data: { floorId, number, area, description: description || null, status: initialStatus, kind },
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
  const kindRaw = String(formData.get("kind") ?? "").toUpperCase()
  const kindIn = kindRaw === "COMMON" ? "COMMON" : kindRaw === "RENTABLE" ? "RENTABLE" : null

  if (!Number.isFinite(area) || area <= 0) {
    throw new Error("Введите корректную площадь (м²)")
  }

  const existing = await db.space.findUnique({
    where: { id },
    select: {
      floorId: true,
      status: true,
      kind: true,
      tenant: { select: { id: true, companyName: true } },
      tenantSpaces: { select: { tenant: { select: { id: true, companyName: true } } } },
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

  // Если хотят сделать помещение COMMON — нельзя если оно уже занято арендатором
  let finalKind = existing.kind
  const occupiedTenant = existing.tenant ?? existing.tenantSpaces[0]?.tenant ?? null
  if (kindIn && kindIn !== existing.kind) {
    if (kindIn === "COMMON" && occupiedTenant) {
      throw new Error(
        `Нельзя сделать помещение общей зоной — оно занято арендатором «${occupiedTenant.companyName}». Сначала выселите.`,
      )
    }
    finalKind = kindIn
  }

  // Если переводим в VACANT/MAINTENANCE и есть привязанный арендатор —
  // автоматически отвязываем его (пользователь уже принял такое решение,
  // меняя статус на «Свободно»).
  const willUnlinkTenant =
    !!occupiedTenant && (finalStatus === "VACANT" || finalStatus === "MAINTENANCE")

  await db.$transaction([
    db.space.update({
      where: { id },
      data: { number, area, description: description || null, status: finalStatus, kind: finalKind },
    }),
    ...(willUnlinkTenant
      ? [
          db.tenantSpace.deleteMany({ where: { spaceId: id } }),
          db.tenant.updateMany({ where: { spaceId: id }, data: { spaceId: null } }),
        ]
      : []),
  ])

  revalidatePath("/admin/spaces")
  revalidatePath("/admin/tenants")
  return { success: true, tenantUnlinked: willUnlinkTenant }
}

export async function deleteSpace(id: string) {
  const { orgId } = await requireOrgAccess()
  await assertSpaceInOrg(id, orgId)

  const space = await db.space.findUnique({
    where: { id },
    include: { tenant: true, tenantSpaces: { include: { tenant: true } } },
  })
  const occupiedTenant = space?.tenant ?? space?.tenantSpaces[0]?.tenant ?? null
  if (occupiedTenant) return { error: "Нельзя удалить — есть арендатор" }

  await db.space.delete({ where: { id } })
  revalidatePath("/admin/spaces")
  return { success: true }
}

/**
 * Удалить ВСЕ помещения во ВСЕХ этажах здания. Применяется как «начать с нуля»
 * для всего здания. Блокируется если хоть одно помещение занято арендатором,
 * либо если хоть один этаж сдан целиком.
 */
export async function deleteAllSpacesInBuilding(buildingId: string, confirmation: string) {
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  if (confirmation.trim().toLowerCase() !== "удалить") {
    throw new Error("Для очистки помещений нужно ввести слово «удалить»")
  }

  const floors = await db.floor.findMany({
    where: { buildingId },
    select: { id: true, name: true, fullFloorTenantId: true, fullFloorTenant: { select: { companyName: true } } },
  })
  const fullFloor = floors.find((f) => f.fullFloorTenantId)
  if (fullFloor) {
    throw new Error(
      `Нельзя удалить помещения — этаж «${fullFloor.name}» сдан целиком арендатору «${fullFloor.fullFloorTenant?.companyName ?? "—"}». Сначала снимите его с этажа.`,
    )
  }
  const floorIds = floors.map((f) => f.id)
  if (floorIds.length === 0) return { success: true, count: 0 }

  const occupied = await db.space.findFirst({
    where: {
      floorId: { in: floorIds },
      OR: [
        { tenant: { isNot: null } },
        { tenantSpaces: { some: {} } },
      ],
    },
    select: {
      number: true,
      floor: { select: { name: true } },
      tenant: { select: { companyName: true } },
      tenantSpaces: { select: { tenant: { select: { companyName: true } } }, take: 1 },
    },
  })
  if (occupied) {
    const tenantName = occupied.tenant?.companyName ?? occupied.tenantSpaces[0]?.tenant.companyName ?? "—"
    throw new Error(
      `Нельзя удалить — кабинет ${occupied.number} (${occupied.floor.name}) занят арендатором «${tenantName}». Сначала выселите.`,
    )
  }

  const result = await db.space.deleteMany({
    where: { floorId: { in: floorIds } },
  })

  revalidatePath("/admin/spaces")
  revalidatePath("/admin/buildings")
  return { success: true, count: result.count }
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
