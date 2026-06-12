import { isObjectSpace, isZoneFloor } from "@/lib/zone-kinds"

type SpaceLike = {
  number?: string | null
  area?: number | null
  // OBJECT — объект на крыше/территории без площади (антенна, щит, парковка).
  kind?: string | null
  floor: {
    name?: string | null
    buildingId?: string | null
    ratePerSqm?: number | null
    // ROOF/TERRITORY — зона; помещения на ней считаются объектами.
    kind?: string | null
  }
}

type TenantSpaceLike = {
  space: SpaceLike
}

type TenantPlacementInput = {
  space?: SpaceLike | null
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
      // Объект на крыше/территории — без префикса «Каб.» и без площади:
      // «Антенна Beeline, Крыша». Обычное помещение — «Каб. 205, 2 этаж».
      const isObject = isObjectSpace(space.kind) || isZoneFloor(space.floor.kind)
      const label = isObject ? (space.number ?? "—") : `Каб. ${space.number ?? "—"}`
      return includeFloorName && space.floor.name ? `${label}, ${space.floor.name}` : label
    })
    .join("; ")
}
