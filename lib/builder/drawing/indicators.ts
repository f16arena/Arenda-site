// Технико-экономические показатели здания для листа «Общие данные»:
// этажность, площадь застройки, общая и арендопригодная площадь, строительный объём.
// Считаются из модели, без ручного ввода.

import type { Building, Floor } from "@/types/builder"
import { floorRooms } from "@/lib/builder/rooms"
import { roomUse } from "@/lib/builder/room-use"
import type { WallGraph } from "@/core/geometry/wall-graph"

export interface BuildingIndicators {
  /** этажей всего (включая цоколь и подвал) */
  floors: number
  /** надземных этажей */
  above: number
  /** площадь застройки, м² */
  footprintM2: number
  /** общая площадь помещений, м² */
  totalM2: number
  /** арендопригодная, м² */
  rentM2: number
  /** МОП и технические, м² */
  commonM2: number
  /** строительный объём, м³ */
  volumeM3: number
  /** высота здания от пола нижнего этажа до верха верхнего, м */
  heightM: number
}

/**
 * Контур застройки: замкнутая цепочка наружных стен по осям. Площадь берётся по
 * внешней грани — к площади по осям добавляется периметр × полтолщины стены.
 */
export function footprintArea(g: WallGraph): number {
  const ext = Object.values(g.edges).filter((e) => e.kind === "exterior")
  if (ext.length < 3) return 0
  const adj = new Map<string, string[]>()
  for (const e of ext) {
    adj.set(e.a, [...(adj.get(e.a) ?? []), e.b])
    adj.set(e.b, [...(adj.get(e.b) ?? []), e.a])
  }
  // обход контура: из самого левого-нижнего узла всё время «направо»
  let start = ext[0].a
  for (const id of adj.keys()) {
    const n = g.nodes[id], s = g.nodes[start]
    if (!n || !s) continue
    if (n.x < s.x || (n.x === s.x && n.y < s.y)) start = id
  }
  const poly: string[] = [start]
  const seen = new Set<string>([start])
  let cur = start
  for (let guard = 0; guard < ext.length * 2 + 4; guard++) {
    const next = (adj.get(cur) ?? []).find((id) => !seen.has(id))
    if (!next) break
    poly.push(next)
    seen.add(next)
    cur = next
  }
  if (poly.length < 3) return 0
  let a2 = 0
  let per = 0
  for (let i = 0; i < poly.length; i++) {
    const p = g.nodes[poly[i]], q = g.nodes[poly[(i + 1) % poly.length]]
    if (!p || !q) return 0
    a2 += p.x * q.y - q.x * p.y
    per += Math.hypot(q.x - p.x, q.y - p.y)
  }
  const half = ext.reduce((s, e) => s + e.thickness, 0) / ext.length / 2
  return (Math.abs(a2) / 2 + per * half) / 1e6
}

export function buildingIndicators(building: Pick<Building, "floors">): BuildingIndicators {
  const floors = building.floors as Floor[]
  let rent = 0
  let common = 0
  for (const f of floors) {
    for (const r of floorRooms(f)) {
      const m2 = r.areaMm2 / 1e6
      if (roomUse(f, r) === "rent") rent += m2
      else common += m2
    }
  }
  const footprint = Math.max(0, ...floors.map((f) => footprintArea(f.wallGraph)))
  const above = floors.filter((f) => f.level > 0).length
  const bottom = Math.min(...floors.map((f) => f.elevation), 0)
  const top = Math.max(...floors.map((f) => f.elevation + f.height), 0)
  const r1 = (v: number) => Math.round(v * 10) / 10
  return {
    floors: floors.length,
    above,
    footprintM2: r1(footprint),
    totalM2: r1(rent + common),
    rentM2: r1(rent),
    commonM2: r1(common),
    volumeM3: Math.round(footprint * ((top - bottom) / 1000)),
    heightM: r1((top - bottom) / 1000),
  }
}
