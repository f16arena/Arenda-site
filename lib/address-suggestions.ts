import { db } from "@/lib/db"

export type AddressSuggestion = {
  id: string
  displayName: string
  countryCode: string
  region: string | null
  city: string | null
  settlement: string | null
  street: string | null
  houseNumber: string | null
  postcode: string | null
  latitude: number | null
  longitude: number | null
  source: string
  sourceId: string | null
}

type PhotonFeature = {
  geometry?: {
    coordinates?: [number, number]
  }
  properties?: {
    osm_id?: string | number
    osm_type?: string
    country?: string
    countrycode?: string
    state?: string
    county?: string
    city?: string
    district?: string
    locality?: string
    name?: string
    street?: string
    housenumber?: string
    postcode?: string
  }
}

type PhotonResponse = {
  features?: PhotonFeature[]
}

const COUNTRY_CODE = "kz"
const SOURCE_PHOTON = "PHOTON"
const MAX_QUERY_LENGTH = 120
const MAX_RESULTS = 8

export function normalizeAddressQuery(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, MAX_QUERY_LENGTH)
}

export async function getAddressSuggestions(orgId: string, rawQuery: string): Promise<AddressSuggestion[]> {
  const query = normalizeAddressQuery(rawQuery)
  if (query.length < 3) return []

  const [savedBuildings, cached] = await Promise.all([
    getSavedBuildingAddresses(orgId, query),
    getCachedAddresses(query),
  ])

  const merged = mergeSuggestions(savedBuildings, cached)
  if (merged.length >= 5 || query.length < 4) return merged.slice(0, MAX_RESULTS)

  const external = await fetchPhoton(query)
  await cacheExternalSuggestions(query, external)

  return mergeSuggestions(merged, external).slice(0, MAX_RESULTS)
}

async function getSavedBuildingAddresses(orgId: string, query: string): Promise<AddressSuggestion[]> {
  const buildings = await db.building.findMany({
    where: {
      organizationId: orgId,
      OR: [
        { address: { contains: query, mode: "insensitive" } },
        { addressCity: { contains: query, mode: "insensitive" } },
        { addressSettlement: { contains: query, mode: "insensitive" } },
        { addressStreet: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      address: true,
      addressCountryCode: true,
      addressRegion: true,
      addressCity: true,
      addressSettlement: true,
      addressStreet: true,
      addressHouseNumber: true,
      addressPostcode: true,
      addressLatitude: true,
      addressLongitude: true,
      addressSource: true,
      addressSourceId: true,
    },
    take: 4,
    orderBy: { createdAt: "desc" },
  })

  return buildings.map((building) => ({
    id: `building:${building.id}`,
    displayName: building.address,
    countryCode: building.addressCountryCode ?? COUNTRY_CODE,
    region: building.addressRegion,
    city: building.addressCity,
    settlement: building.addressSettlement,
    street: building.addressStreet,
    houseNumber: building.addressHouseNumber,
    postcode: building.addressPostcode,
    latitude: building.addressLatitude,
    longitude: building.addressLongitude,
    source: building.addressSource ?? "LOCAL_BUILDING",
    sourceId: building.addressSourceId ?? building.id,
  }))
}

async function getCachedAddresses(query: string): Promise<AddressSuggestion[]> {
  const cached = await db.addressCache.findMany({
    where: {
      countryCode: COUNTRY_CODE,
      OR: [
        { queryKey: { startsWith: query } },
        { displayName: { contains: query, mode: "insensitive" } },
        { city: { contains: query, mode: "insensitive" } },
        { settlement: { contains: query, mode: "insensitive" } },
        { street: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      countryCode: true,
      displayName: true,
      region: true,
      city: true,
      settlement: true,
      street: true,
      houseNumber: true,
      postcode: true,
      latitude: true,
      longitude: true,
      source: true,
      sourceId: true,
    },
    take: MAX_RESULTS,
    orderBy: { updatedAt: "desc" },
  })

  return cached.map((item) => ({
    id: `cache:${item.id}`,
    displayName: item.displayName,
    countryCode: item.countryCode,
    region: item.region,
    city: item.city,
    settlement: item.settlement,
    street: item.street,
    houseNumber: item.houseNumber,
    postcode: item.postcode,
    latitude: item.latitude,
    longitude: item.longitude,
    source: item.source,
    sourceId: item.sourceId,
  }))
}

async function fetchPhoton(query: string): Promise<AddressSuggestion[]> {
  const baseUrl = process.env.PHOTON_BASE_URL ?? "https://photon.komoot.io"
  const url = new URL("/api/", baseUrl)
  url.searchParams.set("q", `${query} Kazakhstan`)
  url.searchParams.set("limit", String(MAX_RESULTS))
  url.searchParams.set("lang", "default")
  url.searchParams.set("lat", "48.0196")
  url.searchParams.set("lon", "66.9237")

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Commrent/1.3 address search (https://commrent.kz)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(3500),
    })

    if (!response.ok) return []
    const json = await response.json() as PhotonResponse
    const features = Array.isArray(json.features) ? json.features : []

    return features
      .map(photonToSuggestion)
      .filter((item): item is AddressSuggestion => !!item)
  } catch {
    return []
  }
}

async function cacheExternalSuggestions(query: string, suggestions: AddressSuggestion[]) {
  await Promise.all(
    suggestions
      .filter((item) => item.source === SOURCE_PHOTON && item.sourceId)
      .map((item) =>
        db.addressCache.upsert({
          where: {
            source_sourceId: {
              source: item.source,
              sourceId: item.sourceId!,
            },
          },
          create: {
            countryCode: item.countryCode,
            queryKey: query,
            displayName: item.displayName,
            region: item.region,
            city: item.city,
            settlement: item.settlement,
            street: item.street,
            houseNumber: item.houseNumber,
            postcode: item.postcode,
            latitude: item.latitude,
            longitude: item.longitude,
            source: item.source,
            sourceId: item.sourceId,
          },
          update: {
            queryKey: query,
            displayName: item.displayName,
            region: item.region,
            city: item.city,
            settlement: item.settlement,
            street: item.street,
            houseNumber: item.houseNumber,
            postcode: item.postcode,
            latitude: item.latitude,
            longitude: item.longitude,
          },
        }),
      ),
  )
}

function photonToSuggestion(item: PhotonFeature): AddressSuggestion | null {
  const properties = item.properties ?? {}
  const countryCode = properties.countrycode?.toLowerCase()
  const country = properties.country?.toLowerCase()
  if (countryCode !== COUNTRY_CODE && country !== "kazakhstan" && country !== "казахстан") return null

  const coordinates = item.geometry?.coordinates
  const longitude = Array.isArray(coordinates) ? parseCoordinate(coordinates[0]) : null
  const latitude = Array.isArray(coordinates) ? parseCoordinate(coordinates[1]) : null
  const street = properties.street ?? null
  const houseNumber = properties.housenumber ?? null
  const city = properties.city ?? null
  const settlement = properties.locality ?? properties.district ?? properties.county ?? null
  const region = properties.state ?? null
  const displayName = buildPhotonDisplayName(properties)
  if (!displayName) return null

  const sourceId = properties.osm_id
    ? `${properties.osm_type ?? "osm"}:${properties.osm_id}`
    : displayName

  return {
    id: `photon:${sourceId}`,
    displayName,
    countryCode: COUNTRY_CODE,
    region,
    city,
    settlement,
    street: street ?? properties.name ?? null,
    houseNumber,
    postcode: properties.postcode ?? null,
    latitude,
    longitude,
    source: SOURCE_PHOTON,
    sourceId,
  }
}

function buildPhotonDisplayName(properties: NonNullable<PhotonFeature["properties"]>) {
  const line = [properties.street ?? properties.name, properties.housenumber].filter(Boolean).join(", ")
  const place = properties.city ?? properties.locality ?? properties.district ?? properties.county
  return uniqueParts([line, place, properties.state, "Казахстан"]).join(", ")
}

function uniqueParts(parts: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const part of parts) {
    const value = part?.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function mergeSuggestions(...groups: AddressSuggestion[][]) {
  const seen = new Set<string>()
  const result: AddressSuggestion[] = []

  for (const item of groups.flat()) {
    const key = `${item.source}:${item.sourceId ?? normalizeAddressQuery(item.displayName)}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }

  return result
}

function parseCoordinate(value: string | number | undefined) {
  if (value === undefined || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
