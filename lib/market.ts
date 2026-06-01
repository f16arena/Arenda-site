import { db } from "@/lib/db"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { getTenantAreaTotal } from "@/lib/tenant-placement"

// Сравнение ставки владельца с рынком (market_rent_stats, наполняется сборщиком).
// Город здания → slug krisha; берём последний снимок медиан по типам; считаем
// ₸/м² владельца как Σ аренды / Σ площади по арендаторам здания.

export const MARKET_TYPE_LABELS: Record<string, string> = {
  OFFICE: "Офисы",
  FREE: "Свободное назначение",
  RETAIL: "Магазины/торговые",
  WAREHOUSE: "Склады",
  OTHER: "Прочее",
}

// Город (как в адресе здания) → slug krisha. Расширяемо.
const CITY_SLUGS: Record<string, { slug: string; label: string }> = {
  "усть-каменогорск": { slug: "ust-kamenogorsk", label: "Усть-Каменогорск" },
  "оскемен": { slug: "ust-kamenogorsk", label: "Усть-Каменогорск" },
  "алматы": { slug: "almaty", label: "Алматы" },
  "астана": { slug: "astana", label: "Астана" },
  "нур-султан": { slug: "astana", label: "Астана" },
  "шымкент": { slug: "shymkent", label: "Шымкент" },
  "караганда": { slug: "karaganda", label: "Караганда" },
  "актобе": { slug: "aktobe", label: "Актобе" },
  "тараз": { slug: "taraz", label: "Тараз" },
  "павлодар": { slug: "pavlodar", label: "Павлодар" },
  "семей": { slug: "semey", label: "Семей" },
  "костанай": { slug: "kostanay", label: "Костанай" },
  "кызылорда": { slug: "kyzylorda", label: "Кызылорда" },
  "атырау": { slug: "atyrau", label: "Атырау" },
  "уральск": { slug: "uralsk", label: "Уральск" },
  "петропавловск": { slug: "petropavlovsk", label: "Петропавловск" },
}

function resolveCity(text: string | null | undefined): { slug: string; label: string } | null {
  if (!text) return null
  const norm = text.toLowerCase().replace(/^г\.?\s*/, "").replace(/\s+/g, " ").trim()
  for (const key of Object.keys(CITY_SLUGS)) {
    if (norm.includes(key)) return CITY_SLUGS[key]
  }
  return null
}

export type MarketTypeStat = {
  propertyType: string
  label: string
  perSqmMedian: number
  perSqmMin: number | null
  perSqmMax: number | null
  sampleCount: number
}

export type MarketComparison = {
  cityLabel: string
  citySlug: string
  collectedAt: string | null
  types: MarketTypeStat[]
  ownerPerSqm: number | null
  ownerArea: number
}

async function computeOwnerPerSqm(buildingIds: string[]): Promise<{ perSqm: number | null; area: number }> {
  const floors = await db.floor.findMany({ where: { buildingId: { in: buildingIds } }, select: { id: true } })
  const floorIds = floors.map((f) => f.id)
  const tenants = await db.tenant.findMany({
    where: {
      OR: [
        { space: { floorId: { in: floorIds } } },
        { tenantSpaces: { some: { space: { floorId: { in: floorIds } } } } },
        { fullFloors: { some: { buildingId: { in: buildingIds } } } },
        { buildingId: { in: buildingIds } },
      ],
    },
    select: {
      fixedMonthlyRent: true,
      customRate: true,
      space: { select: { area: true, floor: { select: { ratePerSqm: true } } } },
      tenantSpaces: { select: { space: { select: { area: true, floor: { select: { ratePerSqm: true } } } } } },
      fullFloors: { select: { totalArea: true, fixedMonthlyRent: true } },
    },
  })

  let rentSum = 0
  let areaSum = 0
  for (const t of tenants) {
    const area = getTenantAreaTotal(t)
    if (area <= 0) continue
    const rent = calculateTenantMonthlyRent(t)
    if (rent <= 0) continue
    rentSum += rent
    areaSum += area
  }
  return { perSqm: areaSum > 0 ? Math.round(rentSum / areaSum) : null, area: Math.round(areaSum) }
}

export async function getMarketComparison({ buildingIds }: { buildingIds: string[] }): Promise<MarketComparison | null> {
  if (buildingIds.length === 0) return null
  const buildings = await db.building.findMany({
    where: { id: { in: buildingIds } },
    select: { addressCity: true, address: true, documentAddress: true },
  })
  let city: { slug: string; label: string } | null = null
  for (const b of buildings) {
    city = resolveCity(b.addressCity) ?? resolveCity(b.documentAddress) ?? resolveCity(b.address)
    if (city) break
  }
  if (!city) return null

  // Последний снимок по городу, district=null, по каждому типу.
  const rows = await db.marketRentStat.findMany({
    where: { city: city.slug, district: null },
    orderBy: { collectedAt: "desc" },
    take: 200,
  })
  const latestByType = new Map<string, (typeof rows)[number]>()
  let collectedAt: Date | null = null
  for (const r of rows) {
    if (!latestByType.has(r.propertyType)) latestByType.set(r.propertyType, r)
    if (!collectedAt || r.collectedAt > collectedAt) collectedAt = r.collectedAt
  }

  const order = ["OFFICE", "FREE", "RETAIL", "WAREHOUSE", "OTHER"]
  const types: MarketTypeStat[] = [...latestByType.values()]
    .map((r) => ({
      propertyType: r.propertyType,
      label: MARKET_TYPE_LABELS[r.propertyType] ?? r.propertyType,
      perSqmMedian: Math.round(r.perSqmMedian),
      perSqmMin: r.perSqmMin !== null ? Math.round(r.perSqmMin) : null,
      perSqmMax: r.perSqmMax !== null ? Math.round(r.perSqmMax) : null,
      sampleCount: r.sampleCount,
    }))
    .sort((a, b) => order.indexOf(a.propertyType) - order.indexOf(b.propertyType))

  const owner = await computeOwnerPerSqm(buildingIds)

  return {
    cityLabel: city.label,
    citySlug: city.slug,
    collectedAt: collectedAt ? collectedAt.toISOString() : null,
    types,
    ownerPerSqm: owner.perSqm,
    ownerArea: owner.area,
  }
}
