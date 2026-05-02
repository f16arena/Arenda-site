// Тип данных плана этажа v2 (SVG-based, в метрах)
// Хранится в Floor.layoutJson

export const LAYOUT_VERSION = 2

export type FloorLayoutV2 = {
  version: 2
  width: number  // ширина холста в метрах
  height: number // высота холста в метрах
  underlayUrl?: string | null
  elements: FloorElement[]
}

export type Point = { x: number; y: number }

export type FloorElement = RectRoom | PolygonRoom | Door | Window | Label | Wall | Icon

// Тип помещения: "rentable" — арендопригодное (привязывается к Space), "common" — общая зона (коридор, тех)
export type RoomKind = "rentable" | "common"

export type RectRoom = {
  type: "rect"
  id: string
  spaceId?: string | null
  kind?: RoomKind  // default: rentable
  x: number      // м
  y: number      // м
  width: number  // м
  height: number // м
  label?: string
}

export type PolygonRoom = {
  type: "polygon"
  id: string
  spaceId?: string | null
  kind?: RoomKind  // default: rentable
  points: Point[]  // вершины в метрах
  label?: string
}

export type Door = {
  type: "door"
  id: string
  x: number       // м (центр)
  y: number       // м
  width: number   // м (по умолчанию 0.9)
  rotation: number // градусы 0/90/180/270
  swing: "left" | "right"
}

export type Window = {
  type: "window"
  id: string
  x: number       // м (центр)
  y: number       // м
  width: number   // м (по умолчанию 1.2)
  rotation: number // градусы 0/90/180/270
}

export type IconKind = "stairs" | "elevator" | "toilet" | "kitchen" | "parking"

export type Icon = {
  type: "icon"
  id: string
  kind: IconKind
  x: number
  y: number
  size: number // м (по умолчанию 1.5)
  label?: string
}

export type Label = {
  type: "label"
  id: string
  x: number
  y: number
  text: string
  fontSize?: number  // м
}

export type Wall = {
  type: "wall"
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  thickness?: number // м (по умолчанию 0.15)
}

export const DEFAULT_LAYOUT: FloorLayoutV2 = {
  version: 2,
  width: 30,
  height: 20,
  elements: [],
}

export function isLayoutV2(obj: unknown): obj is FloorLayoutV2 {
  return typeof obj === "object" && obj !== null && (obj as { version?: number }).version === 2
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

// Площадь полигона по координатам (Shoelace formula)
export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    sum += points[i].x * points[j].y - points[j].x * points[i].y
  }
  return Math.abs(sum) / 2
}

// Разбивка по типам: rentable / common
// Иконки stairs/elevator/toilet считаем общей зоной (size×size).
export function summarizeAreas(layout: FloorLayoutV2): {
  rentable: number  // м² помещений, которые сдаются
  common: number    // м² коридоров, туалетов, лестниц, лифтов, кухонь
  total: number     // rentable + common
} {
  let rentable = 0
  let common = 0
  for (const el of layout.elements) {
    if (el.type === "rect") {
      const a = el.width * el.height
      if ((el.kind ?? "rentable") === "common") common += a
      else rentable += a
    } else if (el.type === "polygon") {
      const a = polygonArea(el.points)
      if ((el.kind ?? "rentable") === "common") common += a
      else rentable += a
    } else if (el.type === "icon") {
      // stairs/elevator/toilet/kitchen/parking — общая зона
      common += el.size * el.size
    }
  }
  return { rentable, common, total: rentable + common }
}

// Центр прямоугольника или полигона для размещения подписи
export function elementCenter(el: FloorElement): Point {
  if (el.type === "rect") return { x: el.x + el.width / 2, y: el.y + el.height / 2 }
  if (el.type === "polygon") {
    const n = el.points.length || 1
    return {
      x: el.points.reduce((s, p) => s + p.x, 0) / n,
      y: el.points.reduce((s, p) => s + p.y, 0) / n,
    }
  }
  if (el.type === "door" || el.type === "window" || el.type === "label" || el.type === "icon") return { x: el.x, y: el.y }
  if (el.type === "wall") return { x: (el.x1 + el.x2) / 2, y: (el.y1 + el.y2) / 2 }
  return { x: 0, y: 0 }
}
