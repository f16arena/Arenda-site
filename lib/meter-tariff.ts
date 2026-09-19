import "server-only"
import { db } from "@/lib/db"
import { getActiveContractForTenant } from "@/lib/active-contract"
import { placementElectricityTariff } from "@/lib/placement-billing"

export interface MeterTariff {
  name: string
  unit: string
  rate: number
}

const TARIFF_TYPE_BY_METER: Record<string, string> = {
  ELECTRICITY: "ELECTRICITY",
  WATER: "WATER",
  HEAT: "HEATING",
}

/**
 * Тариф для начисления по показанию счётчика. Свой тариф на электроэнергию из
 * договора на размещение (киоск на территории платит 48 ₸/кВт·ч при тарифе
 * здания 22) главнее тарифа здания; иначе — активный тариф здания.
 * Единая точка для веба и мобильного приложения.
 */
export async function resolveMeterTariff(tenantId: string, meterType: string, buildingId: string): Promise<MeterTariff | null> {
  if (meterType === "ELECTRICITY") {
    const contract = await getActiveContractForTenant(tenantId)
    const rate = placementElectricityTariff(contract?.builderState ?? null)
    if (rate) return { name: "Электроэнергия (по договору)", unit: "кВт·ч", rate }
  }
  const type = TARIFF_TYPE_BY_METER[meterType]
  if (!type) return null
  return db.tariff.findFirst({
    where: { buildingId, type, isActive: true },
    select: { name: true, unit: true, rate: true },
  })
}
