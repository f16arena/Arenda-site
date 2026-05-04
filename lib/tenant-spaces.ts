export function parseTenantSpaceIds(formData: FormData) {
  const ids = [
    ...formData.getAll("spaceIds"),
    formData.get("spaceId"),
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)

  return [...new Set(ids)]
}

export function formatTenantSpaces(
  tenantSpaces?: Array<{
    space: {
      number: string
      area: number
      floor: { name: string }
    }
  }> | null,
) {
  const spaces = tenantSpaces?.map((item) => item.space) ?? []
  if (spaces.length === 0) return "Не назначено"
  return spaces
    .map((space) => `Каб. ${space.number} · ${space.floor.name}`)
    .join(", ")
}

export function sumTenantSpacesArea(
  tenantSpaces?: Array<{ space: { area: number } }> | null,
) {
  return tenantSpaces?.reduce((sum, item) => sum + item.space.area, 0) ?? 0
}
