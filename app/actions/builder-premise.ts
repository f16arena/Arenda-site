"use server"

// ADR: Данные помещений для Building Studio / витрины (Showcase).
//
// listOrgPremises — читает арендопригодные помещения (Space, kind=RENTABLE) текущей
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

import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import type { PremiseStatus } from "@/lib/builder/materials"

type PremiseRow = {
  id: string
  number: string
  status: PremiseStatus
  tenantName: string | null
  areaM2: number | null
  rate: number | null
}

const MAX_PREMISES = 500

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

/** Месячная ставка арендатора, если задана явно (custom_rate / fixed_monthly_rent). */
function tenantRate(t: { customRate: number | null; fixedMonthlyRent: number | null } | null): number | null {
  if (!t) return null
  if (t.fixedMonthlyRent != null) return t.fixedMonthlyRent
  if (t.customRate != null) return t.customRate
  return null
}

export async function listOrgPremises(): Promise<PremiseRow[]> {
  const { orgId } = await requireOrgAccess()
  const now = new Date()

  const spaces = await db.space.findMany({
    where: {
      kind: "RENTABLE",
      floor: { building: { organizationId: orgId } },
    },
    select: {
      id: true,
      number: true,
      area: true,
      status: true,
      tenant: {
        select: {
          companyName: true,
          customRate: true,
          fixedMonthlyRent: true,
          deletedAt: true,
          // Просроченные неоплаченные начисления → признак долга.
          charges: {
            where: { isPaid: false, deletedAt: null, dueDate: { lt: now } },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ floorId: "asc" }, { number: "asc" }],
    take: MAX_PREMISES,
  })

  return spaces.map((sp): PremiseRow => {
    const tenant = sp.tenant && !sp.tenant.deletedAt ? sp.tenant : null
    const hasDebt = !!tenant && tenant.charges.length > 0
    return {
      id: sp.id,
      number: sp.number,
      status: mapStatus(sp.status, hasDebt),
      tenantName: tenant?.companyName ?? null,
      areaM2: typeof sp.area === "number" ? sp.area : null,
      rate: tenantRate(tenant),
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
        select: { projectId: true },
      })
      let buildingId: string | null = null
      if (share) {
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
      }
    } catch {
      // Витрина не должна падать из-за проблем приёма заявки — мягко принимаем.
      return { ok: true }
    }
  }

  return { ok: true }
}
