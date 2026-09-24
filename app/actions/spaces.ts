"use server"

import { db } from "@/lib/db"
import { getT } from "@/lib/i18n/server"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { assertFloorInOrg, assertSpaceInOrg, assertBuildingInOrg, assertTenantInOrg } from "@/lib/scope-guards"
import { assertSpaceFitsFloor } from "@/lib/area-validation"

const SPACE_STATUSES = new Set(["VACANT", "OCCUPIED", "MAINTENANCE"])

export async function createSpace(formData: FormData) {
  const { t } = await getT()
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  const floorId = formData.get("floorId") as string
  await assertFloorInOrg(floorId, orgId)

  const number = formData.get("number") as string
  const description = formData.get("description") as string
  // RENTABLE = можно сдать, COMMON = коридор/WC/лестница (не сдаётся),
  // OBJECT = объект на крыше/территории без площади (антенна, щит, парковка).
  const kindRaw = String(formData.get("kind") ?? "RENTABLE").toUpperCase()
  const kind = kindRaw === "COMMON" ? "COMMON" : kindRaw === "OBJECT" ? "OBJECT" : "RENTABLE"

  // У объектов (крыша/территория) площади нет — храним 0 и не валидируем.
  const area = kind === "OBJECT" ? 0 : parseFloat(formData.get("area") as string)

  if (kind !== "OBJECT") {
    if (!Number.isFinite(area) || area <= 0) {
      throw new Error(t("actions.spacesActions.badArea"))
    }
    // Σ Space.area не может превысить Floor.totalArea
    await assertSpaceFitsFloor({ floorId, newArea: area })
  }

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

/**
 * Сохранить позицию объекта зоны (смещение от центра зоны в метрах) —
 * результат перетаскивания в 3D. Объект встанет туда при следующем рендере.
 */
export async function setObjectPosition(spaceId: string, x: number, z: number) {
  const { t } = await getT()
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  await assertSpaceInOrg(spaceId, orgId)
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error(t("actions.spacesActions.badPosition"))
  await db.space.update({ where: { id: spaceId }, data: { posX: x, posZ: z } })
  revalidatePath("/admin/spaces")
  return { success: true }
}

/** Сохранить поворот объекта зоны (градусы вокруг вертикали). */
export async function setObjectRotation(spaceId: string, deg: number) {
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  await assertSpaceInOrg(spaceId, orgId)
  const rot = Number.isFinite(deg) ? ((deg % 360) + 360) % 360 : 0
  await db.space.update({ where: { id: spaceId }, data: { posRot: rot } })
  revalidatePath("/admin/spaces")
  return { success: true }
}

/**
 * Создать объект зоны (крыша/территория) без м² и сразу — опционально —
 * назначить арендатора с фиксированной арендой. Один шаг вместо трёх
 * (создать объект → назначить → задать аренду).
 */
export async function createZoneObject(formData: FormData) {
  const { t } = await getT()
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  const floorId = formData.get("floorId") as string
  await assertFloorInOrg(floorId, orgId)

  const name = String(formData.get("number") ?? "").trim()
  if (!name) throw new Error(t("actions.spacesActions.objectNameRequired"))
  const description = String(formData.get("description") ?? "").trim()
  const tenantId = String(formData.get("tenantId") ?? "").trim()
  const fixedRentRaw = String(formData.get("fixedMonthlyRent") ?? "").trim().replace(",", ".")
  const fixedRent = fixedRentRaw ? parseFloat(fixedRentRaw) : null

  const space = await db.space.create({
    data: { floorId, number: name, area: 0, description: description || null, status: "VACANT", kind: "OBJECT" },
  })

  if (tenantId) {
    await assertTenantInOrg(tenantId, orgId)
    // Первая привязка арендатора без помещения становится основной (isPrimary).
    const existing = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { spaceId: true, _count: { select: { tenantSpaces: true } } },
    })
    const isPrimary = !existing?.spaceId && (existing?._count.tenantSpaces ?? 0) === 0
    await db.tenantSpace.create({ data: { tenantId, spaceId: space.id, isPrimary } })
    await db.space.update({ where: { id: space.id }, data: { status: "OCCUPIED" } })
    if (fixedRent && Number.isFinite(fixedRent) && fixedRent > 0) {
      // Фиксированная аренда — очищаем ставку за м² (взаимоисключающие режимы).
      await db.tenant.update({
        where: { id: tenantId },
        data: { fixedMonthlyRent: Math.round(fixedRent), customRate: null },
      })
    }
  }

  revalidatePath("/admin/spaces")
  revalidatePath(`/admin/floors/${floorId}`)
  return { success: true }
}

export async function updateSpace(id: string, formData: FormData) {
  const { t } = await getT()
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  await assertSpaceInOrg(id, orgId)

  const number = formData.get("number") as string
  const area = parseFloat(formData.get("area") as string)
  const description = formData.get("description") as string
  const statusRaw = String(formData.get("status") ?? "VACANT").toUpperCase()
  const status = SPACE_STATUSES.has(statusRaw) ? statusRaw : "VACANT"
  const tenantId = String(formData.get("tenantId") ?? "").trim()
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
          buildingId: true,
          fullFloorTenantId: true,
          fullFloorTenant: { select: { companyName: true } },
        },
      },
    },
  })
  if (!existing) throw new Error(t("actions.spacesActions.notFound"))

  // Σ Space.area не может превысить Floor.totalArea (исключаем текущий)
  await assertSpaceFitsFloor({ floorId: existing.floorId, newArea: area, excludeSpaceId: id })

  // Если этаж сдан целиком — статус нельзя сменить на VACANT/MAINTENANCE: всегда OCCUPIED
  let finalStatus = status
  if (existing.floor.fullFloorTenantId) {
    if (status !== "OCCUPIED") {
      throw new Error(
        t("actions.spacesActions.fullFloorStatus", {
          company: existing.floor.fullFloorTenant?.companyName ?? "—",
          status,
        }),
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
        t("actions.spacesActions.commonZoneOccupied", { company: occupiedTenant.companyName }),
      )
    }
    finalKind = kindIn
  }
  if (finalKind === "COMMON") {
    if (status === "OCCUPIED") {
      throw new Error(t("actions.spacesActions.commonZoneNotOccupiable"))
    }
    finalStatus = "VACANT"
  }

  if (occupiedTenant && finalStatus !== "OCCUPIED") {
    throw new Error(
      t("actions.spacesActions.cannotFreeOccupied", { company: occupiedTenant.companyName }),
    )
  }

  let tenantToAssign: {
    id: string
    companyName: string
    spaceId: string | null
    tenantSpaces: { space: { id: string; floor: { buildingId: string } } }[]
  } | null = null

  if (finalStatus === "OCCUPIED" && !existing.floor.fullFloorTenantId) {
    if (occupiedTenant) {
      if (tenantId && tenantId !== occupiedTenant.id) {
        await requireCapabilityAndFeature("spaces.assignTenant")
        throw new Error(
          t("actions.spacesActions.alreadyOccupied", { company: occupiedTenant.companyName }),
        )
      }
    } else {
      if (!tenantId) {
        throw new Error(t("actions.spacesActions.pickOccupyingTenant"))
      }
      await requireCapabilityAndFeature("spaces.assignTenant")
      tenantToAssign = await db.tenant.findFirst({
        where: {
          id: tenantId,
          user: { organizationId: orgId },
        },
        select: {
          id: true,
          companyName: true,
          spaceId: true,
          space: { select: { floor: { select: { buildingId: true } } } },
          tenantSpaces: { select: { space: { select: { id: true, floor: { select: { buildingId: true } } } } } },
          fullFloors: { select: { buildingId: true } },
        },
      }).then((tenant) => {
        if (!tenant) return null
        const buildingIds = new Set<string>()
        if (tenant.space?.floor.buildingId) buildingIds.add(tenant.space.floor.buildingId)
        for (const item of tenant.tenantSpaces) buildingIds.add(item.space.floor.buildingId)
        for (const floor of tenant.fullFloors) buildingIds.add(floor.buildingId)

        if (tenant.fullFloors.length > 0) {
          throw new Error(
            t("actions.spacesActions.tenantHasWholeFloor", { company: tenant.companyName }),
          )
        }
        if (buildingIds.size > 0 && !buildingIds.has(existing.floor.buildingId)) {
          throw new Error(
            t("actions.spacesActions.tenantOtherBuilding", { company: tenant.companyName }),
          )
        }
        return {
          id: tenant.id,
          companyName: tenant.companyName,
          spaceId: tenant.spaceId,
          tenantSpaces: tenant.tenantSpaces,
        }
      })
      if (!tenantToAssign) throw new Error(t("actions.spacesActions.tenantNotFound"))
    }
  }

  await db.$transaction(async (tx) => {
    await tx.space.update({
      where: { id },
      data: { number, area, description: description || null, status: finalStatus, kind: finalKind },
    })

    if (tenantToAssign) {
      await tx.tenantSpace.create({
        data: {
          tenantId: tenantToAssign.id,
          spaceId: id,
          isPrimary: tenantToAssign.tenantSpaces.length === 0 && !tenantToAssign.spaceId,
        },
      })
      if (!tenantToAssign.spaceId) {
        await tx.tenant.update({ where: { id: tenantToAssign.id }, data: { spaceId: id } })
      }
    }
  })

  revalidatePath("/admin/spaces")
  revalidatePath("/admin/tenants")
  return { success: true, tenantAssigned: !!tenantToAssign }
}

export async function deleteSpace(id: string) {
  const { t } = await getT()
  await requireCapabilityAndFeature("spaces.delete")
  const { orgId } = await requireOrgAccess()
  await assertSpaceInOrg(id, orgId)

  const space = await db.space.findUnique({
    where: { id },
    include: {
      tenant: true,
      tenantSpaces: { include: { tenant: true } },
      floor: { select: { fullFloorTenant: { select: { companyName: true } } } },
    },
  })
  const occupiedTenant = space?.tenant ?? space?.tenantSpaces[0]?.tenant ?? space?.floor.fullFloorTenant ?? null
  if (occupiedTenant) return { error: t("actions.spacesActions.hasTenant") }

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
  const { t } = await getT()
  await requireCapabilityAndFeature("spaces.delete")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  // Принимаем слово на любом из языков интерфейса: казахскому пользователю
  // показывается «жою», и требовать от него русское «удалить» — тупик.
  const CONFIRM_WORDS = ["удалить", "жою"]
  if (!CONFIRM_WORDS.includes(confirmation.trim().toLowerCase())) {
    throw new Error(t("actions.spacesActions.confirmWord"))
  }

  const floors = await db.floor.findMany({
    where: { buildingId },
    select: { id: true, name: true, fullFloorTenantId: true, fullFloorTenant: { select: { companyName: true } } },
  })
  const fullFloor = floors.find((f) => f.fullFloorTenantId)
  if (fullFloor) {
    throw new Error(
      t("actions.spacesActions.wipeFullFloor", {
        floor: fullFloor.name,
        company: fullFloor.fullFloorTenant?.companyName ?? "—",
      }),
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
      t("actions.spacesActions.deleteOccupied", {
        number: occupied.number,
        floor: occupied.floor.name,
        company: tenantName,
      }),
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
  const { t } = await getT()
  await requireCapabilityAndFeature("spaces.delete")
  const { orgId } = await requireOrgAccess()
  await assertFloorInOrg(floorId, orgId)

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
    const tenantName = occupied.tenant?.companyName ?? occupied.tenantSpaces[0]?.tenant.companyName ?? "—"
    throw new Error(
      t("actions.spacesActions.wipeOccupied", {
        number: occupied.number,
        company: tenantName,
      }),
    )
  }

  const result = await db.space.deleteMany({ where: { floorId } })

  revalidatePath("/admin/spaces")
  revalidatePath("/admin/buildings")
  revalidatePath(`/admin/floors/${floorId}`)
  return { success: true, count: result.count }
}
