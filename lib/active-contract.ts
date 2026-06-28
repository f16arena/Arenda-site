import "server-only"
import { db } from "@/lib/db"
import { resolveMonthlyRentForPeriod } from "@/lib/rent"
import { calculateServiceFeeForPeriod, getTenantBuildingId } from "@/lib/service-fee"

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
}

/**
 * Позиции счёта/АВР по договору, когда начислений за период ещё нет:
 *  1) аренда (из условий аренды, синхронизированных с договором);
 *  2) эксплуатационные расходы (сезонная ставка здания × площадь);
 *  3) уборка помещения — если заказана;
 *  4) доп. услуги из конструктора договора (интернет), если заказаны с суммой.
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

  const rent = resolveMonthlyRentForPeriod(tenant, period)
  if (rent > 0) {
    positions.push({ name: `Аренда нежилого помещения за ${period}`, amount: Math.round(rent) })
  }

  // Эксплуатационные расходы — сезонная ставка здания. Пропускаем, если
  // арендатор освобождён от сбора (per-tenant исключение).
  const buildingId = getTenantBuildingId(tenant)
  if (buildingId && !tenant.serviceFeeExempt) {
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
      const fee = calculateServiceFeeForPeriod({ ...tenant, id: tenantId }, building, period, tenant.paymentDueDay ?? 10)
      if (fee.shouldCreate && fee.amount > 0) {
        positions.push({ name: `Эксплуатационные расходы за ${period}`, amount: fee.amount })
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
    positions.push({ name: `Уборка помещения за ${period}`, amount: cleaning })
  }

  const security = orderedAmount(add?.premisesSecurity)
  if (security > 0) {
    positions.push({ name: `Охрана помещения за ${period}`, amount: security })
  }

  const internet = orderedAmount(add?.internet)
  if (internet > 0) {
    positions.push({ name: `Услуги интернета за ${period}`, amount: internet })
  }

  return positions
}
