// Ведомости рабочих чертежей АР: заполнение проёмов (марки ОК-1, Д-1 по всему
// зданию) и экспликация помещений этажа. Один расчёт — для плана, листа и DXF.

import { floorRooms } from "@/lib/builder/rooms"
import { roomDisplayName, roomUse, type RoomUse } from "@/lib/builder/room-use"
import type { Floor, Opening } from "@/types/builder"

export interface OpeningRow {
  mark: string
  type: Opening["type"]
  variant: string
  width: number
  height: number
  /** количество по этажам (id этажа → шт.) */
  perFloor: Record<string, number>
  total: number
}

export interface OpeningSchedule {
  marks: Map<string, string>
  rows: OpeningRow[]
}

const VARIANT_RU: Record<string, string> = {
  single: "однопольная",
  double: "двупольная",
  interior: "внутренняя",
  entrance: "входная",
  glass: "стеклянная",
  sliding: "раздвижная",
  standard: "",
  small: "",
  panoramic: "панорамное",
  curtain: "витражное",
  arch: "арочная",
  garage: "гаражная",
  wide: "широкое",
}

export function openingName(r: Pick<OpeningRow, "type" | "variant" | "width" | "height">): string {
  const v = VARIANT_RU[r.variant] ?? ""
  const size = `${Math.round(r.width)}×${Math.round(r.height)}`
  return r.type === "window" ? `Окно${v ? ` ${v}` : ""} ${size}` : `Дверь${v ? ` ${v}` : ""} ${size}`
}

/**
 * Марки по всему зданию: одинаковые по типу, варианту и размеру проёмы — одна
 * марка. Окна ОК-1…, двери Д-1…, по возрастанию ширины, затем высоты.
 * Демонтируемые проёмы (перепланировка) в ведомость не входят.
 */
export function openingSchedule(floors: Floor[]): OpeningSchedule {
  const groups = new Map<string, OpeningRow & { ids: string[] }>()
  for (const f of floors) {
    for (const o of f.openings) {
      if (o.phase === "demolish" || !f.wallGraph.edges[o.wallId]) continue
      const w = Math.round(o.width / 10) * 10, h = Math.round(o.height / 10) * 10
      const key = `${o.type}|${o.variant}|${w}|${h}`
      const g = groups.get(key) ?? { mark: "", type: o.type, variant: o.variant, width: w, height: h, perFloor: {}, total: 0, ids: [] }
      g.perFloor[f.id] = (g.perFloor[f.id] ?? 0) + 1
      g.total += 1
      g.ids.push(o.id)
      groups.set(key, g)
    }
  }
  const sorted = [...groups.values()].sort((a, b) =>
    a.type !== b.type ? (a.type === "window" ? -1 : 1) : a.width - b.width || a.height - b.height || a.variant.localeCompare(b.variant),
  )
  const marks = new Map<string, string>()
  let win = 0, door = 0
  const rows: OpeningRow[] = sorted.map((g) => {
    const mark = g.type === "window" ? `ОК-${++win}` : `Д-${++door}`
    for (const id of g.ids) marks.set(id, mark)
    return { mark, type: g.type, variant: g.variant, width: g.width, height: g.height, perFloor: g.perFloor, total: g.total }
  })
  return { marks, rows }
}

export interface RoomRow {
  roomId: string
  number: string
  name: string
  areaM2: number
  /** аренда / МОП / техническое */
  use: RoomUse
}

/**
 * Экспликация помещений этажа. Номер — из карточки помещения, иначе по ГОСТ:
 * номер этажа и порядковый (101, 102…; цоколь — 001, подвал — Ц01). Порядок —
 * сверху вниз, слева направо по плану.
 */
export function roomExplication(floor: Floor, premiseNumber: (premiseId: string) => string | null = () => null): RoomRow[] {
  const rooms = floorRooms(floor)
    .map((r) => {
      let cx = 0, cy = 0
      for (const p of r.polygon) { cx += p.x; cy += p.y }
      return { r, cx: cx / r.polygon.length, cy: cy / r.polygon.length }
    })
    .sort((a, b) => (Math.abs(a.cy - b.cy) > 1500 ? b.cy - a.cy : a.cx - b.cx))
  const prefix = floor.level < 0 ? "Ц" : String(Math.max(0, floor.level))
  let seq = 0
  // МОП и технические помещения — без номера арендатора и не сдвигают нумерацию
  // одна карточка на несколько комнат: первая получает номер карточки, остальные — 101.2, 101.3…
  const usedCard = new Map<string, number>()
  // номера карточек занимают свои значения: автонумерация их не повторяет
  const taken = new Set<string>()
  for (const { r } of rooms) {
    const link = floor.premiseLinks[r.id]
    const card = link ? premiseNumber(link) : null
    if (card) taken.add(card)
  }
  return rooms.map(({ r }) => {
    const use = roomUse(floor, r)
    const link = use === "rent" ? floor.premiseLinks[r.id] : undefined
    const card = link ? premiseNumber(link) : null
    let fromCard: string | null = null
    if (card) {
      const n = (usedCard.get(card) ?? 0) + 1
      usedCard.set(card, n)
      fromCard = n === 1 ? card : `${card}.${n}`
    }
    if (use === "rent" && !fromCard) {
      do { seq += 1 } while (taken.has(`${prefix}${String(seq).padStart(2, "0")}`))
    }
    return {
      roomId: r.id,
      use,
      number: use !== "rent" ? "" : fromCard ?? `${prefix}${String(seq).padStart(2, "0")}`,
      name: roomDisplayName(floor, r),
      areaM2: Math.round((r.areaMm2 / 1e6) * 10) / 10,
    }
  })
}
