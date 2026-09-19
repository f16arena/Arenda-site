// Генеральный план: участок, здания с отметкой этажности, дороги, площадки,
// озеленение и въезды. Строится из модели участка — отдельных данных не нужно.

import type { BuilderDocument } from "@/types/builder"
import type { Vec2 } from "@/core/geometry/math"
import { buildingOutline, footprintArea } from "./indicators"
import { islandLabel, islandPolygon } from "../islands"

export interface SitePlan {
  /** граница участка */
  border: Vec2[]
  /** здания: контур, подпись и площадь застройки */
  buildings: Array<{ outline: Vec2[]; label: string; floors: number; areaM2: number }>
  /** дороги и дорожки: осевая линия и ширина */
  roads: Array<{ points: Vec2[]; width: number; kind: "road" | "path" | "fence" }>
  /** площадки с покрытием */
  pavements: Array<{ points: Vec2[]; material: string }>
  /** водоёмы */
  water: Array<{ points: Vec2[] }>
  /** деревья и прочие точечные объекты озеленения */
  greenery: Vec2[]
  /** парковочные места (объекты parking) */
  parking: Vec2[]
  /** размеченные арендные места участка: габарит, марка и наименование */
  spots: Array<{ poly: Vec2[]; at: Vec2; mark: string; name: string; taken: boolean }>
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  /** показатели: площадь участка и застройки, процент застройки */
  siteM2: number
  builtM2: number
}

const GREEN = new Set(["tree", "spruce", "birch", "bush", "flowerbed", "plant_big", "fern"])

export function buildSitePlan(doc: Pick<BuilderDocument, "site" | "buildings">): SitePlan | null {
  const site = doc.site
  const halfX = (site.sizeX ?? 50000) / 2
  const halfZ = (site.sizeZ ?? 40000) / 2
  const border: Vec2[] = [
    { x: -halfX, y: -halfZ }, { x: halfX, y: -halfZ }, { x: halfX, y: halfZ }, { x: -halfX, y: halfZ },
  ]

  const buildings = doc.buildings.map((b) => {
    const ground = [...b.floors].sort((p, q) => p.elevation - q.elevation).find((f) => Object.keys(f.wallGraph.edges).length > 0)
    const outline = ground ? buildingOutline(ground.wallGraph).map((p) => ({ x: p.x + b.origin.x, y: p.y + b.origin.y })) : []
    return {
      outline,
      label: b.name,
      floors: b.floors.filter((f) => f.level > 0).length,
      areaM2: ground ? Math.round(footprintArea(ground.wallGraph) * 10) / 10 : 0,
    }
  }).filter((b) => b.outline.length >= 3)

  const greenery: Vec2[] = []
  const parking: Vec2[] = []
  for (const o of site.objects ?? []) {
    const p = { x: o.position.x, y: o.position.z }
    if (GREEN.has(o.assetId)) greenery.push(p)
    else if (o.assetId === "parking") parking.push(p)
  }

  let minX = -halfX, minY = -halfZ, maxX = halfX, maxY = halfZ
  for (const b of buildings) for (const p of b.outline) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }

  const siteM2 = Math.round(((halfX * 2) / 1000) * ((halfZ * 2) / 1000))
  const builtM2 = Math.round(buildings.reduce((s, b) => s + b.areaM2, 0) * 10) / 10

  return {
    border,
    buildings,
    roads: (site.paths ?? []).map((p) => ({ points: p.points, width: p.width, kind: p.kind })),
    pavements: (site.pavements ?? []).map((p) => ({ points: p.points, material: p.materialId })),
    water: (site.water ?? []).map((w) => ({ points: w.points })),
    greenery,
    parking,
    spots: (site.islands ?? []).map((isl, i) => ({
      poly: islandPolygon(isl),
      at: { x: isl.position.x, y: isl.position.y },
      mark: `П${i + 1}`,
      name: islandLabel(isl),
      taken: !!(isl.tenant ?? "").trim(),
    })),
    bounds: { minX, minY, maxX, maxY },
    siteM2,
    builtM2,
  }
}
