type TenantRentInput = {
  fixedMonthlyRent?: number | null
  customRate?: number | null
  space?: {
    area: number
    floor: {
      ratePerSqm: number
    }
  } | null
  fullFloors?: Array<{
    fixedMonthlyRent: number | null
  }> | null
}

export type RentMode = "FLOOR" | "RATE" | "FIXED"

function positiveAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
}

export function calculateTenantMonthlyRent(tenant: TenantRentInput) {
  const tenantFixedRent = positiveAmount(tenant.fixedMonthlyRent)
  if (tenantFixedRent !== null) return tenantFixedRent

  const fullFloorFixedRent = positiveAmount(tenant.fullFloors?.[0]?.fixedMonthlyRent)
  if (fullFloorFixedRent !== null) return fullFloorFixedRent

  if (!tenant.space) return 0

  const rate = tenant.customRate ?? tenant.space.floor.ratePerSqm
  return tenant.space.area * rate
}

export function calculateTenantRatePerSqm(tenant: Pick<TenantRentInput, "customRate" | "space">) {
  if (!tenant.space) return null
  return tenant.customRate ?? tenant.space.floor.ratePerSqm
}

export function hasFixedTenantRent(value: number | null | undefined) {
  return positiveAmount(value) !== null
}

export function getTenantRentMode(tenant: Pick<TenantRentInput, "customRate" | "fixedMonthlyRent">): RentMode {
  if (positiveAmount(tenant.fixedMonthlyRent) !== null) return "FIXED"
  if (positiveAmount(tenant.customRate) !== null) return "RATE"
  return "FLOOR"
}

export function normalizeTenantRentChoice(input: {
  rentMode?: string | null
  customRate?: number | null
  fixedMonthlyRent?: number | null
  requireValueForMode?: boolean
}) {
  const customRate = positiveAmount(input.customRate)
  const fixedMonthlyRent = positiveAmount(input.fixedMonthlyRent)
  const rawRentMode = input.rentMode?.trim() || null

  if (customRate !== null && fixedMonthlyRent !== null) {
    throw new Error("Выберите только один способ аренды: ставка за м² или фиксированная сумма в месяц")
  }

  const rentMode = rawRentMode === "RATE" || rawRentMode === "FIXED" || rawRentMode === "FLOOR"
    ? rawRentMode
    : null

  if (rawRentMode !== null && rentMode === null) {
    throw new Error("Неверный способ расчета аренды")
  }

  if (rentMode === "FLOOR") {
    return { rentMode, customRate: null, fixedMonthlyRent: null }
  }

  if (rentMode === "RATE") {
    if (fixedMonthlyRent !== null) {
      throw new Error("Для режима ставки за м² очистите фиксированную аренду в месяц")
    }
    if (input.requireValueForMode && customRate === null) {
      throw new Error("Укажите индивидуальную ставку за м² или выберите другой способ аренды")
    }
    return { rentMode, customRate, fixedMonthlyRent: null }
  }

  if (rentMode === "FIXED") {
    if (customRate !== null) {
      throw new Error("Для режима фиксированной аренды очистите ставку за м²")
    }
    if (input.requireValueForMode && fixedMonthlyRent === null) {
      throw new Error("Укажите фиксированную сумму аренды в месяц или выберите другой способ аренды")
    }
    return { rentMode, customRate: null, fixedMonthlyRent }
  }

  if (fixedMonthlyRent !== null) return { rentMode: "FIXED" as const, customRate: null, fixedMonthlyRent }
  if (customRate !== null) return { rentMode: "RATE" as const, customRate, fixedMonthlyRent: null }
  return { rentMode: "FLOOR" as const, customRate: null, fixedMonthlyRent: null }
}
