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
