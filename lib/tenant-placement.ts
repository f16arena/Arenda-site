type TenantSpaceLike = {
  space: {
    number?: string | null
    area?: number | null
    floor: {
      name?: string | null
      buildingId?: string | null
      ratePerSqm?: number | null
    }
  }
}

type TenantPlacementInput = {
  space?: {
    number?: string | null
    area?: number | null
    floor: {
      name?: string | null
      buildingId?: string | null
      ratePerSqm?: number | null
    }
  } | null
  tenantSpaces?: TenantSpaceLike[] | null
  fullFloors?: Array<{
    name?: string | null
    totalArea?: number | null
    fixedMonthlyRent?: number | null
    buildingId?: string | null
  }> | null
}

function positiveAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
}

export function getTenantAssignedSpaces(tenant: TenantPlacementInput) {
  const spaces = tenant.tenantSpaces?.map((item) => item.space).filter(Boolean) ?? []
  if (spaces.length > 0) return spaces
  return tenant.space ? [tenant.space] : []
}

export function getTenantFullFloorRentTotal(tenant: TenantPlacementInput) {
  const total = (tenant.fullFloors ?? []).reduce((sum, floor) => {
    return sum + (positiveAmount(floor.fixedMonthlyRent) ?? 0)
  }, 0)
  return total > 0 ? total : null
}

export function getTenantFullFloorAreaTotal(tenant: TenantPlacementInput) {
  return (tenant.fullFloors ?? []).reduce((sum, floor) => {
    return sum + (positiveAmount(floor.totalArea) ?? 0)
  }, 0)
}

export function getTenantAreaTotal(tenant: TenantPlacementInput) {
  const fullFloorArea = getTenantFullFloorAreaTotal(tenant)
  if (fullFloorArea > 0) return fullFloorArea
  return getTenantAssignedSpaces(tenant).reduce((sum, space) => sum + (positiveAmount(space.area) ?? 0), 0)
}

export function getTenantPrimaryBuildingId(tenant: TenantPlacementInput) {
  return (
    tenant.space?.floor.buildingId ??
    tenant.tenantSpaces?.[0]?.space.floor.buildingId ??
    tenant.fullFloors?.[0]?.buildingId ??
    null
  )
}

export function formatTenantPlacement(
  tenant: TenantPlacementInput,
  options?: {
    emptyLabel?: string
    includeFloorName?: boolean
  },
) {
  const emptyLabel = options?.emptyLabel ?? "по договору"
  const includeFloorName = options?.includeFloorName ?? true
  const fullFloors = tenant.fullFloors?.filter((floor) => floor.name) ?? []

  if (fullFloors.length > 0) {
    return fullFloors.map((floor) => floor.name).join("; ")
  }

  const spaces = getTenantAssignedSpaces(tenant)
  if (spaces.length === 0) return emptyLabel

  return spaces
    .map((space) => {
      const room = `Каб. ${space.number ?? "—"}`
      return includeFloorName && space.floor.name ? `${room}, ${space.floor.name}` : room
    })
    .join("; ")
}
