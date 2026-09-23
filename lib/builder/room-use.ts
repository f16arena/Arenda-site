// Назначение помещения: аренда, места общего пользования (МОП) или техническое.
// МОП и технические — часть здания: у них нет номера арендатора и карточки,
// на плане — наименование и штриховка, в экспликации — отдельный итог.
// Без явной отметки назначение определяется само: лестница или лифт внутри,
// либо наименование («Коридор», «Санузел», «Электрощитовая»…).

import type { Floor } from "@/types/builder"
import { pointInPolygon, type Vec2 } from "@/core/geometry/math"
import { stairHoleWorld } from "./stair-hole"

export type RoomUse = "rent" | "common" | "tech"

/** Ключи авто-наименований в словаре (adminBuilder.roomNames). */
export type RoomNameKey = "stairwell" | "elevatorHall" | "techShort" | "common"

// Наименование помещения пишет человек, и по нему же определяется назначение.
// Поэтому в шаблоны добавлены казахские слова: иначе «Дәліз» не попал бы в МОП
// и коридор оказался бы арендной площадью.
const COMMON_NAME = /коридор|холл|тамбур|лестн|вестибюл|лифт|фойе|лобби|санузел|с\/у|туалет|уборн|wc|переход|галере|крыльц|входн|дәліз|баспалдақ|дәретхана|вестибюль|кіреберіс|өтпе/i
const TECH_NAME = /щитов|электрощит|венткамер|технич|насосн|тепловой|итп|серверн|кладов|уборочн|мусор|машинн|котельн|водомер|қалқан|желдету камера|техникалық|сорғы|жылу торабы|сервер|қойма|қоқыс|қазандық|су өлшеу/i

type RoomLike = { id: string; polygon: Vec2[] }
type FloorLike = Pick<Floor, "stairs" | "height"> & Partial<Pick<Floor, "roomUse" | "roomNames">>

/** Что стоит в помещении: лестница или лифт (по центру выреза). Колонны и крыльца не в счёт. */
function stairInside(floor: FloorLike, room: RoomLike): "stair" | "elevator" | null {
  for (const st of floor.stairs) {
    if (st.shape === "column" || st.shape === "porch" || st.shape === "ramp") continue
    const h = stairHoleWorld(st, floor.height)
    if (pointInPolygon({ x: (h[0].x + h[2].x) / 2, y: (h[0].y + h[2].y) / 2 }, room.polygon)) return st.shape === "elevator" ? "elevator" : "stair"
  }
  return null
}

/**
 * Автоматическое назначение и наименование по умолчанию. `name` — ключ
 * словаря, а не готовая строка: наименование попадает и в интерфейс, и в
 * экспликацию, где язык выбирает тот, кто печатает лист.
 */
export function autoRoomUse(floor: FloorLike, room: RoomLike): { use: RoomUse; name: RoomNameKey | null } {
  const inside = stairInside(floor, room)
  if (inside === "stair") return { use: "common", name: "stairwell" }
  if (inside === "elevator") return { use: "common", name: "elevatorHall" }
  const name = floor.roomNames?.[room.id] ?? ""
  if (TECH_NAME.test(name)) return { use: "tech", name: null }
  if (COMMON_NAME.test(name)) return { use: "common", name: null }
  return { use: "rent", name: null }
}

export function roomUse(floor: FloorLike, room: RoomLike): RoomUse {
  return floor.roomUse?.[room.id] ?? autoRoomUse(floor, room).use
}

/**
 * Наименование для подписи: заданное вручную — как есть, иначе ключ авто-имени
 * («Лестничная клетка», «МОП», «Техническое»), иначе пусто. Ключ отличается от
 * ручного имени тем, что его надо перевести — для этого есть roomName().
 */
export function roomNameOrKey(floor: FloorLike, room: RoomLike): { own: string } | { key: RoomNameKey } | null {
  const own = floor.roomNames?.[room.id]
  if (own) return { own }
  const auto = autoRoomUse(floor, room).name
  if (auto) return { key: auto }
  const use = roomUse(floor, room)
  if (use === "common") return { key: "common" }
  if (use === "tech") return { key: "techShort" }
  return null
}

/**
 * Готовая подпись помещения. `names` переводит ключ авто-имени; без него
 * возвращается сам ключ — так его видят только тесты и отладка.
 */
export function roomDisplayName(floor: FloorLike, room: RoomLike, names?: (key: RoomNameKey) => string): string {
  const value = roomNameOrKey(floor, room)
  if (!value) return ""
  if ("own" in value) return value.own
  return names ? names(value.key) : value.key
}
