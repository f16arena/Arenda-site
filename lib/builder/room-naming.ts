// Типовые наименования помещений по геометрии: экспликация без наименований
// выглядит недоделанной, а вписывать «Офис» полсотни раз руками — работа на
// вечер. Подбор — подсказка: любое имя правится вручную и откатывается Ctrl+Z.

import type { Floor, Opening } from "@/types/builder"
import type { Vec2 } from "@/core/geometry/math"
import type { FloorRoom } from "./rooms"
import { roomUse } from "./room-use"
import type { Messages } from "@/lib/i18n/messages"

/** Ключи типовых наименований помещений. */
export type SuggestedNameKey = keyof Messages["adminBuilder"]["roomNames"]

function bbox(poly: Vec2[]): { w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of poly) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  return { w: maxX - minX, h: maxY - minY }
}

function nearPolygon(p: Vec2, poly: Vec2[], tol: number): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    if (Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)) <= tol) return true
  }
  return false
}

function openingCenter(floor: Pick<Floor, "wallGraph">, o: Opening): Vec2 | null {
  const e = floor.wallGraph.edges[o.wallId]
  if (!e) return null
  const a = floor.wallGraph.nodes[e.a], b = floor.wallGraph.nodes[e.b]
  if (!a || !b) return null
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const t = Math.min(1, Math.max(0, o.offset / len))
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/**
 * Наименование по геометрии помещения: площадь, вытянутость, окна и двери.
 * Возвращает КЛЮЧ словаря (adminBuilder.roomNames), а не готовую строку:
 * подсказка ложится в экспликацию, и язык выбирает тот, кто её подставляет.
 * null — подсказывать нечего (имя уже есть или назначение определяется
 * автоматически: лестничная клетка, лифтовой холл).
 */
export function suggestRoomName(floor: Floor, room: FloorRoom): SuggestedNameKey | null {
  if (floor.roomNames?.[room.id]) return null
  const areaM2 = room.areaMm2 / 1e6
  if (areaM2 < 1) return null
  const ops: Opening[] = []
  for (const o of floor.openings) {
    const c = openingCenter(floor, o)
    const e = floor.wallGraph.edges[o.wallId]
    if (!c) continue
    if (nearPolygon(c, room.polygon, Math.max(350, (e?.thickness ?? 200) * 1.5))) ops.push(o)
  }
  const windows = ops.filter((o) => o.type === "window").length
  const doors = ops.filter((o) => o.type === "door").length
  const { w, h } = bbox(room.polygon)
  const long = Math.max(w, h), short = Math.min(w, h) || 1
  const ratio = long / short
  const use = roomUse(floor, room)

  if (use === "tech") return areaM2 < 8 ? "electrical" : "tech"
  // длинное узкое помещение с несколькими дверями — коридор
  if (ratio >= 3 && doors >= 2) return "corridor"
  if (ratio >= 4 && areaM2 > 6) return "corridor"
  if (areaM2 <= 6 && windows === 0 && doors <= 1) return areaM2 <= 3.5 ? "wc" : "utility"
  if (areaM2 <= 12 && windows === 0) return "storage"
  if (use === "common") return areaM2 > 30 ? "hall" : "lobby"
  if (windows > 0 && areaM2 > 60) return "openOffice"
  if (windows > 0) return "office"
  return "premise"
}

/** Наименования для всех безымянных помещений этажа: roomId → ключ наименования. */
export function suggestFloorNames(floor: Floor, rooms: FloorRoom[]): Record<string, SuggestedNameKey> {
  const out: Record<string, SuggestedNameKey> = {}
  for (const r of rooms) {
    const name = suggestRoomName(floor, r)
    if (name) out[r.id] = name
  }
  return out
}
