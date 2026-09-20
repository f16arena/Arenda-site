"use server"

// ADR: Данные помещений для Building Studio / витрины (Showcase).
//
// listBuildingPremises — читает помещения здания (Space) текущей
// организации (орг-скоуп через floor.building.organizationId, как и весь app-level
// scope вместо RLS) и маппит «сырой» статус БД в доменный PremiseStatus движка витрины.
//
// Статусы в БД (Space.status): VACANT | OCCUPIED | MAINTENANCE. Бронь под лид и ремонт
// обслуживание тоже выставляют MAINTENANCE (см. app/actions/leads.ts). «Долг» в схеме
// отдельным статусом не хранится — он вычисляется из просроченных неоплаченных Charge
// у занятого помещения. Доменный тип PremiseStatus (lib/builder/materials.ts) НЕ содержит
// "repair" — materials.ts не трогаем; MAINTENANCE маппим в ближайший "booked".
//
// submitBuilderLead — публичная заявка из витрины (без auth). Если витрина привязана к
// проекту с известным зданием — создаём Lead (модель есть в схеме). Иначе валидируем вход
// и возвращаем {ok:true} (мягкий приём, без выдуманных миграций).

import { notifyRentalInquiry } from "@/lib/rental-inquiry"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { shareLinkValid } from "@/lib/builder/share-link"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingAccess } from "@/lib/building-access"
import { tenantInBuildingsWhere } from "@/lib/tenant-scope"
import type { BuildingPremise } from "@/store/premise-store"
import type { PremiseStatus } from "@/lib/builder/materials"


const MAX_PREMISES = 500

function floorLabelOf(f: { number: number; kind: string | null }): string {
  if (f.kind === "ROOF") return "Крыша"
  if (f.kind === "TERRITORY") return "Территория"
  return f.number === 0 ? "Цоколь" : `${f.number} этаж`
}

/**
 * Маппит «сырой» статус помещения (+ признаки занятости/долга) в доменный PremiseStatus.
 * Концептуально поддерживаем и "repair", но т.к. PremiseStatus его не содержит —
 * MAINTENANCE/repair сводим к ближайшему "booked". Тип возврата строго PremiseStatus.
 */
function mapStatus(raw: string, hasDebt: boolean): PremiseStatus {
  const s = raw.toUpperCase()
  // Долг приоритетнее «занято»: занятое помещение с просрочкой подсвечивается красным.
  if (hasDebt) return "debt"
  switch (s) {
    case "OCCUPIED":
    case "RENTED":
      return "occupied"
    case "BOOKED":
    case "RESERVED":
    case "MAINTENANCE": // бронь под лид / ремонт / обслуживание → ближайший доступный статус
    case "REPAIR":
      return "booked"
    case "DEBT":
    case "OVERDUE":
      return "debt"
    case "VACANT":
    case "FREE":
    default:
      return "free"
  }
}

/**
 * Помещения одного здания — для модели этого здания. Не вся организация:
 * у сотрудника может быть открыт только свой объект, и в модель БЦ F16
 * незачем предлагать помещения Magic Room. Ключ — id карточки.
 */
export async function listBuildingPremises(buildingId: string): Promise<BuildingPremise[]> {
  const { orgId } = await requireOrgAccess()
  await assertBuildingAccess(buildingId, orgId)
  const now = new Date()

  const spaces = await db.space.findMany({
    where: { floor: { buildingId, building: { organizationId: orgId } } },
    select: {
      id: true,
      number: true,
      area: true,
      status: true,
      kind: true,
      floor: { select: { number: true, kind: true } },
      tenant: {
        select: {
          companyName: true,
          deletedAt: true,
          charges: {
            where: { isPaid: false, deletedAt: null, dueDate: { lt: now } },
            select: { amount: true },
          },
        },
      },
      tenantSpaces: {
        select: {
          tenant: {
            select: {
              companyName: true,
              deletedAt: true,
              charges: {
                where: { isPaid: false, deletedAt: null, dueDate: { lt: now } },
                select: { amount: true },
              },
            },
          },
        },
      },
    },
    orderBy: [{ floor: { number: "asc" } }, { number: "asc" }],
    take: MAX_PREMISES,
  })

  return spaces.map((sp): BuildingPremise => {
    const raw = sp.tenant ?? sp.tenantSpaces[0]?.tenant ?? null
    const tenant = raw && !raw.deletedAt ? raw : null
    const debt = tenant ? tenant.charges.reduce((sum, c) => sum + c.amount, 0) : 0
    return {
      id: sp.id,
      number: sp.number,
      floorNumber: sp.floor.number,
      floorLabel: floorLabelOf(sp.floor),
      status: sp.kind === "COMMON" ? "free" : mapStatus(sp.status, debt > 0),
      tenantName: tenant?.companyName ?? null,
      areaM2: typeof sp.area === "number" ? sp.area : null,
      debt,
    }
  })
}

export async function submitBuilderLead(input: {
  token?: string
  premiseNumber?: string
  name: string
  phone: string
  message?: string
}): Promise<{ ok: boolean }> {
  // Защита от мусора: тримминг + лимиты длины. Витрина публичная (без auth).
  const name = (input.name ?? "").trim().slice(0, 120)
  const phone = (input.phone ?? "").trim().slice(0, 40)
  const message = (input.message ?? "").trim().slice(0, 1000)
  const premiseNumber = (input.premiseNumber ?? "").trim().slice(0, 60)
  const token = (input.token ?? "").trim().slice(0, 64)

  if (!name || !phone) return { ok: false }

  // Пытаемся привязать заявку к зданию через токен витрины → проект → buildingId.
  // BuilderShare не объявляет relation на проект, поэтому идём в два шага:
  // token → projectId → BuilderProject.buildingId.
  // Если связки/здания нет — мягкий приём (валидно, но без записи): не выдумываем миграции.
  if (token) {
    try {
      const share = await db.builderShare.findUnique({
        where: { token },
        select: { projectId: true, revokedAt: true, expiresAt: true },
      })
      let buildingId: string | null = null
      if (shareLinkValid(share)) {
        const project = await db.builderProject.findUnique({
          where: { id: share.projectId },
          select: { buildingId: true },
        })
        buildingId = project?.buildingId ?? null
      }

      if (buildingId) {
        const notesParts = [
          premiseNumber ? `Помещение: ${premiseNumber}` : null,
          message || null,
        ].filter(Boolean) as string[]

        await db.lead.create({
          data: {
            buildingId,
            name,
            contact: phone,
            contactType: phone.includes("@") ? "EMAIL" : "PHONE",
            spaceId: null,
            source: "SITE",
            status: "NEW",
            notes: notesParts.length > 0 ? notesParts.join(" — ") : null,
          },
        })
        await notifyRentalInquiry({
          buildingId,
          name,
          contact: phone,
          details: notesParts.length > 0 ? notesParts.join(" — ") : null,
          source: "витрины здания",
        })
      }
    } catch {
      // Витрина не должна падать из-за проблем приёма заявки — мягко принимаем.
      return { ok: true }
    }
  }

  return { ok: true }
}

/**
 * Карточка помещения под арендное место (островок): вендинг, киоск, банкомат
 * в коридоре сдаются так же, как помещение, но заводить их руками через
 * «Помещения» ради одного автомата — лишний круг. Кнопка в свойствах места
 * создаёт карточку на этом этаже и сразу возвращает её для привязки.
 *
 * Номер — «М-N» (место), первый свободный по зданию: с обычными номерами
 * помещений («101», «2-А») такой не пересекается.
 */
export async function createIslandPremise(input: {
  /** id этажа в базе (Floor.id) — берётся из floor.sourceFloorId модели */
  floorId?: string | null
  /** Место на участке (не на этаже) — карточка заводится на «Территории» этого здания */
  buildingId?: string
  areaM2: number
  name?: string
}): Promise<BuildingPremise | null> {
  const { orgId } = await requireOrgAccess()
  const floor = input.floorId
    ? await db.floor.findFirst({
        where: { id: input.floorId, building: { organizationId: orgId } },
        select: { id: true, number: true, kind: true, buildingId: true },
      })
    : input.buildingId
      ? await territoryFloor(input.buildingId, orgId)
      : null
  if (!floor) return null
  await assertBuildingAccess(floor.buildingId, orgId)

  const taken = await db.space.findMany({
    where: { floor: { buildingId: floor.buildingId }, number: { startsWith: "М-" } },
    select: { number: true },
  })
  const used = new Set(taken.map((s) => s.number))
  let n = 1
  while (used.has(`М-${n}`) && n < 500) n++

  const area = Math.max(0.1, Math.round(input.areaM2 * 100) / 100)
  const created = await db.space.create({
    data: {
      floorId: floor.id,
      number: `М-${n}`,
      area,
      status: "VACANT",
      kind: "RENTABLE",
      description: (input.name ?? "").trim().slice(0, 200) || null,
    },
    select: { id: true, number: true },
  })
  return {
    id: created.id,
    number: created.number,
    floorNumber: floor.number,
    floorLabel: floorLabelOf(floor),
    status: "free",
    tenantName: null,
    areaM2: area,
    debt: 0,
  }
}

/** «Территория» здания — для мест на участке (киоск, навес). Нет — заводим. */
async function territoryFloor(buildingId: string, orgId: string) {
  const building = await db.building.findFirst({ where: { id: buildingId, organizationId: orgId }, select: { id: true } })
  if (!building) return null
  const existing = await db.floor.findFirst({
    where: { buildingId, kind: "TERRITORY" },
    select: { id: true, number: true, kind: true, buildingId: true },
  })
  if (existing) return existing
  const top = await db.floor.aggregate({ where: { buildingId }, _max: { number: true } })
  return db.floor.create({
    data: { buildingId, number: (top._max.number ?? 0) + 1, name: "Территория", kind: "TERRITORY", ratePerSqm: 0 },
    select: { id: true, number: true, kind: true, buildingId: true },
  })
}

export type BuilderTenantOption = { id: string; name: string; place: string | null }

/**
 * Арендаторы здания для выбора в конструкторе — все 4 пути привязки, включая
 * новых без помещения (киоск на территории, антенна): их и нужно сажать на место.
 */
export async function listBuilderTenants(buildingId: string): Promise<BuilderTenantOption[]> {
  const { orgId } = await requireOrgAccess()
  await assertBuildingAccess(buildingId, orgId)
  const rows = await db.tenant.findMany({
    where: tenantInBuildingsWhere(orgId, [buildingId]),
    select: {
      id: true,
      companyName: true,
      space: { select: { number: true } },
      tenantSpaces: { select: { space: { select: { number: true } } } },
    },
    orderBy: { companyName: "asc" },
    take: 100,
  })
  return rows.map((t) => {
    const nums = [...new Set([t.space?.number, ...t.tenantSpaces.map((x) => x.space.number)].filter(Boolean))] as string[]
    return { id: t.id, name: t.companyName, place: nums.length ? `№ ${nums.join(", ")}` : null }
  })
}

/**
 * Посадить арендатора на место из конструктора. Ошибку возвращаем текстом:
 * брошенная из server action ошибка в проде превращается в «An error occurred
 * in the Server Components render…» и причина не видна.
 */
export async function assignTenantToPlace(tenantId: string, spaceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { assignTenantSpace } = await import("@/app/actions/tenant")
    await assignTenantSpace(tenantId, spaceId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось посадить арендатора" }
  }
}

/**
 * Площадь карточки места = габариты объекта в модели. Поменяли размер киоска
 * в 3D — площадь в «Помещениях» и эксплуатационный сбор пересчитываются.
 * Возвращаем обновлённую строку для стора конструктора.
 */
export async function syncIslandPremiseArea(spaceId: string, areaM2: number): Promise<BuildingPremise | null> {
  const { orgId } = await requireOrgAccess()
  const space = await db.space.findFirst({
    where: { id: spaceId, floor: { building: { organizationId: orgId } } },
    select: { id: true, number: true, area: true, status: true, kind: true, floor: { select: { buildingId: true, number: true, kind: true } } },
  })
  if (!space) return null
  await assertBuildingAccess(space.floor.buildingId, orgId)
  const area = Math.max(0.1, Math.round(areaM2 * 100) / 100)
  if (Math.abs(area - space.area) < 0.01) return null
  await db.space.update({ where: { id: space.id }, data: { area } })
  revalidatePath("/admin/spaces")
  revalidatePath("/admin/finances")
  return {
    id: space.id,
    number: space.number,
    floorNumber: space.floor.number,
    floorLabel: floorLabelOf(space.floor),
    status: space.status === "OCCUPIED" ? "occupied" : "free",
    tenantName: null,
    areaM2: area,
    debt: 0,
  }
}
