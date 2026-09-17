// Назначение помещения: аренда, места общего пользования (МОП) или техническое.
// МОП и технические — часть здания: у них нет номера арендатора и карточки,
// на плане — наименование и штриховка, в экспликации — отдельный итог.
// Без явной отметки назначение определяется само: лестница или лифт внутри,
// либо наименование («Коридор», «Санузел», «Электрощитовая»…).

import type { Floor } from "@/types/builder"
import { pointInPolygon, type Vec2 } from "@/core/geometry/math"
import { stairHoleWorld } from "./stair-hole"

export type RoomUse = "rent" | "common" | "tech"

export const ROOM_USE_LABEL: Record<RoomUse, string> = { rent: "Аренда", common: "МОП", tech: "Техническое" }

const COMMON_NAME = /коридор|холл|тамбур|лестн|вестибюл|лифт|фойе|лобби|санузел|с\/у|туалет|уборн|wc|переход|галере|крыльц|входн/i
const TECH_NAME = /щитов|электрощит|венткамер|технич|насосн|тепловой|итп|серверн|кладов|уборочн|мусор|машинн|котельн|водомер/i

type RoomLike = { id: string; polygon: Vec2[] }
type FloorLike = Pick<Floor, "stairs" | "height"> & Partial<Pick<Floor, "roomUse" | "roomNames">>

/** Что стоит в помещении: лестница или лифт (по центру выреза). Колонны и крыльца не в счёт. */
function stairInside(floor: FloorLike, room: RoomLike): "stair" | "elevator" | null {
  for (const st of floor.stairs) {
    if (st.shape === "column" || st.shape === "porch") continue
    const h = stairHoleWorld(st, floor.height)
    if (pointInPolygon({ x: (h[0].x + h[2].x) / 2, y: (h[0].y + h[2].y) / 2 }, room.polygon)) return st.shape === "elevator" ? "elevator" : "stair"
  }
  return null
}

/** Автоматическое назначение и наименование по умолчанию. */
export function autoRoomUse(floor: FloorLike, room: RoomLike): { use: RoomUse; name: string | null } {
  const inside = stairInside(floor, room)
  if (inside === "stair") return { use: "common", name: "Лестничная клетка" }
  if (inside === "elevator") return { use: "common", name: "Лифтовой холл" }
  const name = floor.roomNames?.[room.id] ?? ""
  if (TECH_NAME.test(name)) return { use: "tech", name: null }
  if (COMMON_NAME.test(name)) return { use: "common", name: null }
  return { use: "rent", name: null }
}

export function roomUse(floor: FloorLike, room: RoomLike): RoomUse {
  return floor.roomUse?.[room.id] ?? autoRoomUse(floor, room).use
}

/** Наименование для подписи: заданное вручную, иначе авто («Лестничная клетка»), иначе пусто. */
export function roomDisplayName(floor: FloorLike, room: RoomLike): string {
  return floor.roomNames?.[room.id] || autoRoomUse(floor, room).name || (roomUse(floor, room) === "common" ? "МОП" : roomUse(floor, room) === "tech" ? "Техническое" : "")
}
