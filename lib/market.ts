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

// Срез сравнения: «Город» (вся область) или конкретный район. Пользователь
// сужает/расширяет область, чтобы видеть рынок ближе к своему адресу или шире.
export type MarketScope = {
  key: string // "city" | district name
  label: string
  isCity: boolean
  types: MarketTypeStat[]
}

export type MarketComparison = {
  cityLabel: string
  citySlug: string
  collectedAt: string | null
  scopes: MarketScope[] // [0] = Город, далее районы с данными
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

  // Последние снимки по городу (и город целиком district=null, и районы).
  // Источник цены — krisha (OLX недостоверен на уровне списка, см. README сборщика).
  const rows = await db.marketRentStat.findMany({
    where: { city: city.slug, source: "krisha" },
    orderBy: { collectedAt: "desc" },
    // Берём самые свежие строки; дедуп до последней на (район, тип) ниже.
    // Combos одного города ограничены (≤~44), 140 покрывает последний снимок.
    take: 140,
  })

  const order = ["OFFICE", "FREE", "RETAIL", "WAREHOUSE", "OTHER"]
  let collectedAt: Date | null = null
  // группируем по scopeKey (city|district) → последняя строка на тип
  const byScope = new Map<string, Map<string, (typeof rows)[number]>>()
  for (const r of rows) {
    if (!collectedAt || r.collectedAt > collectedAt) collectedAt = r.collectedAt
    const key = r.district ?? "__city__"
    if (!byScope.has(key)) byScope.set(key, new Map())
    const tmap = byScope.get(key)!
    if (!tmap.has(r.propertyType)) tmap.set(r.propertyType, r)
  }

  const toTypes = (tmap: Map<string, (typeof rows)[number]>): MarketTypeStat[] =>
    [...tmap.values()]
      .map((r) => ({
        propertyType: r.propertyType,
        label: MARKET_TYPE_LABELS[r.propertyType] ?? r.propertyType,
        perSqmMedian: Math.round(r.perSqmMedian),
        perSqmMin: r.perSqmMin !== null ? Math.round(r.perSqmMin) : null,
        perSqmMax: r.perSqmMax !== null ? Math.round(r.perSqmMax) : null,
        sampleCount: r.sampleCount,
      }))
      .sort((a, b) => order.indexOf(a.propertyType) - order.indexOf(b.propertyType))

  const scopes: MarketScope[] = []
  const cityMap = byScope.get("__city__")
  if (cityMap) scopes.push({ key: "city", label: `Весь город (${city.label})`, isCity: true, types: toTypes(cityMap) })
  for (const [key, tmap] of byScope) {
    if (key === "__city__") continue
    scopes.push({ key, label: key, isCity: false, types: toTypes(tmap) })
  }
  // районы — по убыванию выборки (надёжнее сверху)
  scopes.sort((a, b) => {
    if (a.isCity) return -1
    if (b.isCity) return 1
    const an = a.types.reduce((s, t) => s + t.sampleCount, 0)
    const bn = b.types.reduce((s, t) => s + t.sampleCount, 0)
    return bn - an
  })

  const owner = await computeOwnerPerSqm(buildingIds)

  return {
    cityLabel: city.label,
    citySlug: city.slug,
    collectedAt: collectedAt ? collectedAt.toISOString() : null,
    scopes,
    ownerPerSqm: owner.perSqm,
    ownerArea: owner.area,
  }
}
