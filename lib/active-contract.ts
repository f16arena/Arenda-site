import "server-only"
import { db } from "@/lib/db"
import { resolveMonthlyRentForPeriod } from "@/lib/rent"
import {
  buildingWithContractRates,
  calculateServiceFeeForPeriod,
  contractServiceFeeTerms,
  getTenantBuildingId,
} from "@/lib/service-fee"
import { rentItemName, isPremisesLikeType } from "@/lib/contract-placement-types"
import { placementServiceFeeForPeriod } from "@/lib/placement-billing"

export interface ActiveContract {
  id: string
  number: string
  startDate: Date | null
  endDate: Date | null
  signedAt: Date | null
  builderState: unknown
}

export const NO_ACTIVE_CONTRACT_ERROR =
  "У контрагента нет действующего договора аренды. Счёт, АВР и акт сверки создаются только по действующему (подписанному и не истёкшему) договору — сначала оформите и подпишите договор."

/**
 * Действующий договор арендатора: подписан обеими сторонами (SIGNED), не удалён,
 * не доп. соглашение и срок не истёк (endDate пуст или в будущем).
 * Правило: счёт на оплату, АВР и акт сверки выставляются только по нему.
 */
export async function getActiveContractForTenant(tenantId: string): Promise<ActiveContract | null> {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  return db.contract.findFirst({
    where: {
      tenantId,
      deletedAt: null,
      status: "SIGNED",
      type: { not: "ADDENDUM" },
      OR: [{ endDate: null }, { endDate: { gte: startOfToday } }],
    },
    orderBy: [{ version: "desc" }, { signedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, number: true, startDate: true, endDate: true, signedAt: true, builderState: true },
  })
}

export interface ContractPosition {
  name: string
  amount: number
  /** Тип начисления для биллинга (RENT | SERVICE_FEE | CLEANING | OTHER). */
  type: string
}

/**
 * Позиции счёта/АВР по договору, когда начислений за период ещё нет:
 *  1) аренда (из условий аренды, синхронизированных с договором);
 *  2) эксплуатационные расходы (сезонная ставка здания × площадь);
 *  3) уборка помещения — если заказана;
 *  4) доп. услуги из конструктора договора и подписанных ДС (интернет, охрана).
 */
export async function buildContractPositions(
  tenantId: string,
  period: string,
  contract: ActiveContract,
): Promise<ContractPosition[]> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      contractStart: true,
      contractEnd: true,
      customRate: true,
      fixedMonthlyRent: true,
      rentSchedule: true,
      paymentDueDay: true,
      serviceFeeExempt: true,
      needsCleaning: true,
      cleaningFee: true,
      space: { select: { area: true, floor: { select: { ratePerSqm: true, buildingId: true } } } },
      tenantSpaces: { select: { space: { select: { area: true, floor: { select: { ratePerSqm: true, buildingId: true } } } } } },
      fullFloors: { select: { totalArea: true, fixedMonthlyRent: true, buildingId: true } },
    },
  })
  if (!tenant) return []

  const positions: ContractPosition[] = []

  // Тип предмета (помещение/оборудование/…) — из конструктора договора: влияет на
  // название позиции аренды в счёте/АВР («Размещение оборудования за …» и т.п.).
  const placementType = (contract.builderState as { meta?: { placementType?: string } } | null)?.meta?.placementType ?? null

  const rent = resolveMonthlyRentForPeriod(tenant, period)
  if (rent > 0) {
    positions.push({ name: rentItemName(placementType, period), amount: Math.round(rent), type: "RENT" })
  }

  // Эксплуатационные расходы — сезонная ставка здания. Пропускаем, если арендатор
  // освобождён от сбора (per-tenant исключение) ИЛИ предмет — не помещение
  // (оборудование/крыша/территория/реклама/парковка): у таких объектов нет
  // площади-базы, аренда фиксированная, эксп.сбор не начисляется.
  // Договор на размещение со своей ставкой за м² Места (круглый год) — она
  // и есть условие договора; ставка здания к такому арендатору не применяется.
  const placementFee = placementServiceFeeForPeriod(contract.builderState, period, tenant.contractStart, tenant.contractEnd)
  if (placementFee && placementFee.amount > 0) {
    positions.push({ name: `Эксплуатационные расходы за ${period}`, amount: placementFee.amount, type: "SERVICE_FEE" })
  }
  // Условия договора первичны: если в нём расходы включены в аренду, ставка
  // здания не применяется, а если в договоре записана своя ставка — считаем по ней.
  const feeTerms = contractServiceFeeTerms(contract.builderState)
  const buildingId = getTenantBuildingId(tenant)
  if (
    !placementFee
    && buildingId
    && !tenant.serviceFeeExempt
    && feeTerms.kind !== "none"
    && isPremisesLikeType(placementType)
  ) {
    const building = await db.building.findUnique({
      where: { id: buildingId },
      select: {
        id: true,
        serviceFeeWinterRate: true,
        serviceFeeSummerRate: true,
        serviceFeeWinterMonths: true,
        serviceFeeIndexationPct: true,
      },
    })
    if (building) {
      const source = buildingWithContractRates(building, feeTerms)
      const fee = calculateServiceFeeForPeriod({ ...tenant, id: tenantId }, source, period, tenant.paymentDueDay ?? 10)
      if (fee.shouldCreate && fee.amount > 0) {
        positions.push({ name: `Эксплуатационные расходы за ${period}`, amount: fee.amount, type: "SERVICE_FEE" })
      }
    }
  }

  // Доп. услуги из конструктора договора (Приложение № 2: уборка/охрана/интернет).
  type OrderedService = { ordered?: boolean; monthly?: number }
  const st = contract.builderState as {
    financials?: {
      additionalServices?: {
        internet?: OrderedService
        premisesCleaning?: OrderedService
        premisesSecurity?: OrderedService
      }
    }
  } | null
  const add = st?.financials?.additionalServices
  const orderedAmount = (s: OrderedService | undefined) =>
    s?.ordered && typeof s.monthly === "number" && s.monthly > 0 ? Math.round(s.monthly) : 0

  // Уборка: карточка арендатора первична (синхронизируется при подписании);
  // для договоров, подписанных до синка, — fallback на договор.
  const cleaningFromCard = tenant.needsCleaning && (tenant.cleaningFee ?? 0) > 0 ? Math.round(tenant.cleaningFee ?? 0) : 0
  const cleaning = cleaningFromCard || orderedAmount(add?.premisesCleaning)
  if (cleaning > 0) {
    positions.push({ name: `Уборка помещения за ${period}`, amount: cleaning, type: "CLEANING" })
  }

  // Подписанные допсоглашения «доп. услуги» тоже часть договора: интернет/охрана
  // из ДС заменяют сумму из основного договора (последнее ДС — главное).
  const fromAddenda = await addendumServicesForPeriod(contract.id, period)
  const security = fromAddenda.security ?? orderedAmount(add?.premisesSecurity)
  if (security > 0) {
    positions.push({ name: `Охрана помещения за ${period}`, amount: security, type: "SECURITY" })
  }

  const internet = fromAddenda.internet ?? orderedAmount(add?.internet)
  if (internet > 0) {
    positions.push({ name: `Услуги интернета за ${period}`, amount: internet, type: "INTERNET" })
  }

  return positions
}

/**
 * Услуги из подписанных ДС (changeKind SERVICES) на месяц `period` ("YYYY-MM").
 * ДС, вступившее в силу в середине месяца, считается за дни с даты вступления;
 * вступившее позже месяца — не учитывается. null — ДС про эту услугу нет.
 */
export async function addendumServicesForPeriod(
  contractId: string,
  period: string,
): Promise<{ internet: number | null; security: number | null }> {
  const [y, m] = period.split("-").map(Number)
  const monthStart = new Date(y, m - 1, 1)
  const nextMonth = new Date(y, m, 1)
  const daysInMonth = Math.round((nextMonth.getTime() - monthStart.getTime()) / 86_400_000)
  const addenda = await db.contract.findMany({
    where: {
      parentContractId: contractId,
      type: "ADDENDUM",
      status: "SIGNED",
      changeKind: "SERVICES",
      deletedAt: null,
      effectiveDate: { lt: nextMonth },
    },
    orderBy: { effectiveDate: "asc" },
    select: { effectiveDate: true, changePayload: true },
  })
  const out: { internet: number | null; security: number | null } = { internet: null, security: null }
  for (const a of addenda) {
    const services = (a.changePayload as { services?: Record<string, { monthly?: unknown } | null> } | null)?.services
    if (!services) continue
    const eff = a.effectiveDate ?? monthStart
    // Доля месяца: с даты вступления в силу до конца месяца.
    const share = eff > monthStart
      ? Math.max(0, Math.round((nextMonth.getTime() - new Date(eff.getFullYear(), eff.getMonth(), eff.getDate()).getTime()) / 86_400_000)) / daysInMonth
      : 1
    for (const key of ["internet", "security"] as const) {
      const monthly = services[key]?.monthly
      if (typeof monthly === "number" && monthly > 0) out[key] = Math.round(monthly * share * 100) / 100
    }
  }
  return out
}
