// Модель → план этажа. Одна геометрия на продукт (SPEC indoor-map §2):
// конструктор — источник, план этажа (FloorLayoutV2) выводится из него, и всё,
// что живёт поверх плана — карта, статусы, подписи, долги, печать — продолжает
// работать без своей геометрии.
//
// Чистая функция, без базы: этаж документа → FloorLayoutV2 в метрах.

import type { Floor as ModelFloor } from "@/types/builder"
import type { FloorElement, FloorLayoutV2 } from "@/lib/floor-layout"
import { detectRooms } from "@/core/geometry/room-detection"

const MM = 1 / 1000
// В модели ось Y плана смотрит вверх (как в CAD и в «Плане» конструктора),
// на карте (SVG) — вниз. Без разворота карта показывала этаж вверх ногами.
const flipY = (y: number) => -y

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** Ортогональная ротация проёма по направлению стены: 0/90/180/270. */
function orthoRotation(dx: number, dy: number): number {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI
  const snapped = Math.round(deg / 90) * 90
  return ((snapped % 360) + 360) % 360
}

export function floorToLayout(floor: ModelFloor): FloorLayoutV2 {
  const elements: FloorElement[] = []
  // Холст карты начинается в (0; 0), а у модели координаты от центра и бывают
  // отрицательными (пристройки, тамбур). Сдвигаем этаж так, чтобы крайний узел
  // лёг в 1 м от угла холста — иначе карта обрезала бы часть здания.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const id in floor.wallGraph.nodes) {
    const n = floor.wallGraph.nodes[id]
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, flipY(n.y))
    maxX = Math.max(maxX, n.x)
    maxY = Math.max(maxY, flipY(n.y))
  }
  const hasNodes = Number.isFinite(minX)
  const ox = hasNodes ? minX : 0
  const oy = hasNodes ? minY : 0
  const mx = (x: number) => round((x - ox) * MM + 1)
  const my = (y: number) => round((flipY(y) - oy) * MM + 1)
  const rooms = detectRooms(floor.wallGraph)

  // Помещения: контур в метрах, привязка к карточке из premiseLinks.
  // Комната без привязки остаётся арендопригодной — так её видно на карте
  // как «без привязки», а не прячется в общую зону.
  for (const room of rooms) {
    elements.push({
      type: "polygon",
      id: room.id,
      spaceId: floor.premiseLinks[room.id] ?? null,
      kind: "rentable",
      points: room.polygon.map((p) => ({ x: mx(p.x), y: my(p.y) })),
    })
  }

  // Стены — как линии: карта рисует их поверх помещений
  for (const id in floor.wallGraph.edges) {
    const edge = floor.wallGraph.edges[id]
    const a = floor.wallGraph.nodes[edge.a]
    const b = floor.wallGraph.nodes[edge.b]
    if (!a || !b) continue
    elements.push({
      type: "wall",
      id,
      x1: mx(a.x),
      y1: my(a.y),
      x2: mx(b.x),
      y2: my(b.y),
      thickness: round(edge.thickness * MM),
    })
  }

  // Проёмы: центр по смещению вдоль стены
  for (const opening of floor.openings) {
    const edge = floor.wallGraph.edges[opening.wallId]
    if (!edge) continue
    const a = floor.wallGraph.nodes[edge.a]
    const b = floor.wallGraph.nodes[edge.b]
    if (!a || !b) continue
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length === 0) continue
    const t = Math.min(1, Math.max(0, (opening.offset + opening.width / 2) / length))
    const cx = a.x + (b.x - a.x) * t
    const cy = a.y + (b.y - a.y) * t
    const rotation = orthoRotation(b.x - a.x, flipY(b.y) - flipY(a.y))
    if (opening.type === "door") {
      elements.push({
        type: "door",
        id: opening.id,
        x: mx(cx),
        y: my(cy),
        width: round(opening.width * MM),
        rotation,
        swing: "left",
      })
    } else {
      elements.push({
        type: "window",
        id: opening.id,
        x: mx(cx),
        y: my(cy),
        width: round(opening.width * MM),
        rotation,
      })
    }
  }

  const width = hasNodes ? round((maxX - minX) * MM + 2) : 30
  const height = hasNodes ? round((maxY - minY) * MM + 2) : 20

  const underlay = floor.underlay
  return {
    version: 2,
    width: Math.max(width, 5),
    height: Math.max(height, 5),
    ceilingHeight: round(floor.height * MM),
    source: "model",
    underlay: underlay
      ? {
          url: underlay.url,
          widthMeters: round(underlay.widthMm * MM),
          aspect: underlay.aspect,
          x: mx(underlay.x),
          // верхний левый угол картинки: в модели y — нижняя граница по оси вверх
          y: my(underlay.y + underlay.widthMm / (underlay.aspect || 1)),
          opacity: underlay.opacity,
        }
      : null,
    elements,
  }
}
