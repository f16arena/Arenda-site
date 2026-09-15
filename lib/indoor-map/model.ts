// Сборка «вида этажа»: план (геометрия) + данные из БД (кто сидит, что свободно).
// План хранит только spaceId — статусы и подписи приходят отсюда (SPEC §2).

import type { FloorLayoutV2, Point } from "@/lib/floor-layout"
import { isRoom, labelAnchor, roomPolygon, area as polygonArea, widthAt } from "./geometry"
import type { RoomStatus, TenantCategory } from "./tokens"

/** За сколько дней до конца договора помещение считается «освобождается». */
export const EXPIRING_DAYS = 90

export type SpaceLite = {
  id: string
  number: string
  area: number
  status: string
  kind: string
  tenantId: string | null
  tenantName: string | null
  contractEnd: string | null
  category: TenantCategory | null
  /** неоплаченные начисления арендатора, ₸ */
  debt: number
}

export type RoomView = {
  id: string
  spaceId: string | null
  status: RoomStatus
  points: Point[]
  anchor: Point
  anchorWidth: number
  area: number
  title: string
  number: string | null
  tenantId: string | null
  tenantName: string | null
  contractEnd: string | null
  daysLeft: number | null
  category: TenantCategory | null
  debt: number
}

export type FloorView = {
  rooms: RoomView[]
  vacantArea: number
  rentableArea: number
  occupiedCount: number
  vacantCount: number
  /** сколько помещений на этаже с неоплаченными начислениями */
  debtCount: number
}

function daysUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null
  const end = new Date(iso).getTime()
  if (Number.isNaN(end)) return null
  return Math.ceil((end - now.getTime()) / 86_400_000)
}

function statusOf(space: SpaceLite | undefined, daysLeft: number | null): RoomStatus {
  if (!space) return "MAINTENANCE"
  if (space.kind === "COMMON") return "COMMON"
  if (space.status === "MAINTENANCE") return "MAINTENANCE"
  if (space.status === "VACANT") return "VACANT"
  if (daysLeft !== null && daysLeft <= EXPIRING_DAYS) return "EXPIRING"
  return "OCCUPIED"
}

function titleFor(
  status: RoomStatus,
  space: SpaceLite | undefined,
  label: string | undefined,
): string {
  if (status === "COMMON") return label?.trim() || "Общая зона"
  const tenant = space?.tenantName?.trim()
  if (tenant) return tenant
  if (status === "VACANT") return "Свободно"
  if (status === "MAINTENANCE") return space ? "Не сдаётся" : "Без привязки"
  return label?.trim() || (space?.number ? `Помещение ${space.number}` : "Без привязки")
}

export function buildFloorView(
  layout: FloorLayoutV2,
  spaces: SpaceLite[],
  now: Date = new Date(),
): FloorView {
  const byId = new Map(spaces.map((s) => [s.id, s]))
  const rooms: RoomView[] = []

  for (const el of layout.elements) {
    if (!isRoom(el)) continue
    const points = roomPolygon(el)
    if (points.length < 3) continue

    const space = el.spaceId ? byId.get(el.spaceId) : undefined
    const declaredCommon = (el.kind ?? "rentable") === "common"
    const daysLeft = daysUntil(space?.contractEnd ?? null, now)
    const status: RoomStatus = declaredCommon ? "COMMON" : statusOf(space, daysLeft)
    const anchor = labelAnchor(points)

    rooms.push({
      id: el.id,
      spaceId: el.spaceId ?? null,
      status,
      points,
      anchor,
      anchorWidth: widthAt(points, anchor),
      area: space?.area ?? polygonArea(points),
      title: titleFor(status, space, el.label),
      number: space?.number ?? null,
      tenantId: space?.tenantId ?? null,
      tenantName: space?.tenantName ?? null,
      contractEnd: space?.contractEnd ?? null,
      daysLeft,
      category: space?.category ?? null,
      debt: space?.debt ?? 0,
    })
  }

  let vacantArea = 0
  let rentableArea = 0
  let occupiedCount = 0
  let vacantCount = 0
  let debtCount = 0
  for (const r of rooms) {
    if (r.status === "COMMON") continue
    rentableArea += r.area
    if (r.debt > 0) debtCount += 1
    if (r.status === "VACANT") {
      vacantArea += r.area
      vacantCount += 1
    } else if (r.status === "OCCUPIED" || r.status === "EXPIRING") {
      occupiedCount += 1
    }
  }

  return { rooms, vacantArea, rentableArea, occupiedCount, vacantCount, debtCount }
}
