import { db } from "@/lib/db"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { getTenantAreaTotal } from "@/lib/tenant-placement"

// Сравнение ставки владельца с рынком (market_rent_stats, наполняется сборщиком).
// Город здания → slug krisha; берём последний снимок медиан по типам; считаем
// ₸/м² владельца как Σ аренды / Σ площади по арендаторам здания.

// Названия видов помещений и городов — в словаре (catalogs.marketTypes,
// catalogs.cities): модуль отдаёт ключ, подпись подставляет страница.
export type MarketPropertyType = "OFFICE" | "FREE" | "RETAIL" | "WAREHOUSE" | "OTHER"
export type MarketTypeNameKey = `catalogs.marketTypes.${MarketPropertyType}`

type CityId =
  | "ustKamenogorsk"
  | "almaty"
  | "astana"
  | "shymkent"
  | "karaganda"
  | "aktobe"
  | "taraz"
  | "pavlodar"
  | "semey"
  | "kostanay"
  | "kyzylorda"
  | "atyrau"
  | "uralsk"
  | "petropavlovsk"
export type CityNameKey = `catalogs.cities.${CityId}`

// Город (как в адресе здания) → slug krisha. Расширяемо.
//
// Ключи — это СПИСОК ДЛЯ СОПОСТАВЛЕНИЯ: адрес здания заводит владелец руками, и
// мы ищем город по подстроке. Поэтому здесь нужны оба написания — русское и
// казахское («Өскемен», «Қарағанды», «Орал»), и переводить их нельзя, только
// дополнять. Подпись города берётся из nameKey, а не отсюда.
const CITY_SLUGS: Record<string, { slug: string; nameKey: CityNameKey }> = {
  "усть-каменогорск": { slug: "ust-kamenogorsk", nameKey: "catalogs.cities.ustKamenogorsk" },
  "оскемен": { slug: "ust-kamenogorsk", nameKey: "catalogs.cities.ustKamenogorsk" },
  "өскемен": { slug: "ust-kamenogorsk", nameKey: "catalogs.cities.ustKamenogorsk" },
  "алматы": { slug: "almaty", nameKey: "catalogs.cities.almaty" },
  "астана": { slug: "astana", nameKey: "catalogs.cities.astana" },
  "нур-султан": { slug: "astana", nameKey: "catalogs.cities.astana" },
  "шымкент": { slug: "shymkent", nameKey: "catalogs.cities.shymkent" },
  "караганда": { slug: "karaganda", nameKey: "catalogs.cities.karaganda" },
  "қарағанды": { slug: "karaganda", nameKey: "catalogs.cities.karaganda" },
  "актобе": { slug: "aktobe", nameKey: "catalogs.cities.aktobe" },
  "ақтөбе": { slug: "aktobe", nameKey: "catalogs.cities.aktobe" },
  "тараз": { slug: "taraz", nameKey: "catalogs.cities.taraz" },
  "павлодар": { slug: "pavlodar", nameKey: "catalogs.cities.pavlodar" },
  "семей": { slug: "semey", nameKey: "catalogs.cities.semey" },
  "костанай": { slug: "kostanay", nameKey: "catalogs.cities.kostanay" },
  "қостанай": { slug: "kostanay", nameKey: "catalogs.cities.kostanay" },
  "кызылорда": { slug: "kyzylorda", nameKey: "catalogs.cities.kyzylorda" },
  "қызылорда": { slug: "kyzylorda", nameKey: "catalogs.cities.kyzylorda" },
  "атырау": { slug: "atyrau", nameKey: "catalogs.cities.atyrau" },
  "уральск": { slug: "uralsk", nameKey: "catalogs.cities.uralsk" },
  "орал": { slug: "uralsk", nameKey: "catalogs.cities.uralsk" },
  "петропавловск": { slug: "petropavlovsk", nameKey: "catalogs.cities.petropavlovsk" },
  "петропавл": { slug: "petropavlovsk", nameKey: "catalogs.cities.petropavlovsk" },
}

function resolveCity(text: string | null | undefined): { slug: string; nameKey: CityNameKey } | null {
  if (!text) return null
  const norm = text.toLowerCase().replace(/^г\.?\s*/, "").replace(/\s+/g, " ").trim()
  for (const key of Object.keys(CITY_SLUGS)) {
    if (norm.includes(key)) return CITY_SLUGS[key]
  }
  return null
}

const MARKET_TYPES: readonly MarketPropertyType[] = ["OFFICE", "FREE", "RETAIL", "WAREHOUSE", "OTHER"]

/**
 * Ключ названия вида помещения в словаре; null для вида, которого в справочнике
 * нет (сборщик krisha мог принести новый) — такой показываем кодом как есть.
 */
export function marketTypeNameKey(propertyType: string): MarketTypeNameKey | null {
  return (MARKET_TYPES as readonly string[]).includes(propertyType)
    ? `catalogs.marketTypes.${propertyType as MarketPropertyType}`
    : null
}

export type MarketTypeStat = {
  propertyType: string
  perSqmMedian: number
  perSqmMin: number | null
  perSqmMax: number | null
  sampleCount: number
}

// Срез сравнения: «Город» (вся область) или конкретный район. Пользователь
// сужает/расширяет область, чтобы видеть рынок ближе к своему адресу или шире.
export type MarketScope = {
  key: string // "city" | district name
  /** Название района как его отдаёт krisha; null — весь город. */
  district: string | null
  isCity: boolean
  types: MarketTypeStat[]
}

export type MarketComparison = {
  cityNameKey: CityNameKey
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
  let city: { slug: string; nameKey: CityNameKey } | null = null
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
        perSqmMedian: Math.round(r.perSqmMedian),
        perSqmMin: r.perSqmMin !== null ? Math.round(r.perSqmMin) : null,
        perSqmMax: r.perSqmMax !== null ? Math.round(r.perSqmMax) : null,
        sampleCount: r.sampleCount,
      }))
      .sort((a, b) => order.indexOf(a.propertyType) - order.indexOf(b.propertyType))

  const scopes: MarketScope[] = []
  const cityMap = byScope.get("__city__")
  if (cityMap) scopes.push({ key: "city", district: null, isCity: true, types: toTypes(cityMap) })
  for (const [key, tmap] of byScope) {
    if (key === "__city__") continue
    scopes.push({ key, district: key, isCity: false, types: toTypes(tmap) })
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
    cityNameKey: city.nameKey,
    citySlug: city.slug,
    collectedAt: collectedAt ? collectedAt.toISOString() : null,
    scopes,
    ownerPerSqm: owner.perSqm,
    ownerArea: owner.area,
  }
}

// Медиана рынка по городу (₸/м²/мес) для подсказки цены: офис → своб. назначение →
// магазин → склад → прочее. null, если по городу нет собранных данных.
const TYPE_PRIORITY = ["OFFICE", "FREE", "RETAIL", "WAREHOUSE", "OTHER"]
export async function getCityMedianPerSqm(buildingIds: string[]): Promise<number | null> {
  const cmp = await getMarketComparison({ buildingIds })
  const scope = cmp?.scopes.find((s) => s.isCity) ?? cmp?.scopes[0]
  if (!scope) return null
  for (const key of TYPE_PRIORITY) {
    const hit = scope.types.find((t) => t.propertyType === key)
    if (hit && hit.perSqmMedian > 0) return Math.round(hit.perSqmMedian)
  }
  return null
}
