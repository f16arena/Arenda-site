import "server-only"
import { db } from "@/lib/db"
import { calculateTenantMonthlyRent } from "@/lib/rent"
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
      paymentDueDay: true,
      needsCleaning: true,
      cleaningFee: true,
      space: { select: { area: true, floor: { select: { ratePerSqm: true, buildingId: true } } } },
      tenantSpaces: { select: { space: { select: { area: true, floor: { select: { ratePerSqm: true, buildingId: true } } } } } },
      fullFloors: { select: { totalArea: true, fixedMonthlyRent: true, buildingId: true } },
    },
  })
  if (!tenant) return []

  const positions: ContractPosition[] = []

  const rent = calculateTenantMonthlyRent(tenant)
  if (rent > 0) {
    positions.push({ name: `Аренда нежилого помещения за ${period}`, amount: Math.round(rent) })
  }

  // Эксплуатационные расходы — сезонная ставка здания.
  const buildingId = getTenantBuildingId(tenant)
  if (buildingId) {
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

  if (tenant.needsCleaning && (tenant.cleaningFee ?? 0) > 0) {
    positions.push({ name: `Уборка помещения за ${period}`, amount: Math.round(tenant.cleaningFee ?? 0) })
  }

  // Доп. услуги из конструктора договора (если в договоре заказаны с суммой).
  const st = contract.builderState as {
    financials?: { additionalServices?: { internet?: { ordered?: boolean; monthly?: number } } }
  } | null
  const internet = st?.financials?.additionalServices?.internet
  if (internet?.ordered && typeof internet.monthly === "number" && internet.monthly > 0) {
    positions.push({ name: `Услуги интернета за ${period}`, amount: Math.round(internet.monthly) })
  }

  return positions
}
