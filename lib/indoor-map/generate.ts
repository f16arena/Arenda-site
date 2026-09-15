// Сборка схемы этажа из уже заведённых помещений (SPEC §6, путь 3).
//
// Это НЕ обмерный план: настоящую геометрию даёт только обводка по подложке.
// Но пока плана нет, карта пустая, а у собственника уже есть список помещений
// с площадями — из них собирается честная схема: две галереи вдоль коридора,
// ширина помещения пропорциональна его площади. Такую схему сразу видно на
// карте, по ней уже читаются статусы, и она помечена как схема.

import type { FloorElement, FloorLayoutV2 } from "@/lib/floor-layout"

export type SchemaSpace = {
  id: string
  number: string
  area: number
  kind: string
}

export type SchemaOptions = {
  /** глубина галереи, м. По умолчанию выводится из площадей помещений */
  depth?: number
  /** ширина коридора между галереями, м */
  corridor?: number
}

const MIN_ROOM_WIDTH = 1.5
const MIN_DEPTH = 4
const MAX_DEPTH = 14

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Собрать схему этажа. Возвращает null, если собирать не из чего —
 * тогда интерфейс честно предлагает нарисовать план, а не подсовывает пустышку.
 */
export function generateSchemaLayout(
  spaces: SchemaSpace[],
  options: SchemaOptions = {},
): FloorLayoutV2 | null {
  const usable = spaces
    .filter((space) => Number.isFinite(space.area) && space.area > 0)
    .sort((a, b) => a.number.localeCompare(b.number, "ru", { numeric: true }))
  if (usable.length === 0) return null

  // Глубина галереи: делаем помещения близкими к квадрату, иначе схема
  // вырождается в длинные кишки или в широкие полосы.
  const depth = round(
    Math.max(
      MIN_DEPTH,
      Math.min(MAX_DEPTH, options.depth ?? median(usable.map((space) => Math.sqrt(space.area)))),
    ),
  )
  const corridor = round(options.corridor ?? Math.max(3, Math.min(6, depth * 0.55)))

  // Раскладываем по двум галереям, каждый раз в ту, что сейчас короче, —
  // так обе стороны получаются примерно одной длины.
  const rows: Array<{ width: number; items: Array<{ space: SchemaSpace; width: number }> }> = [
    { width: 0, items: [] },
    { width: 0, items: [] },
  ]
  for (const space of usable) {
    const width = Math.max(MIN_ROOM_WIDTH, round(space.area / depth))
    const target = rows[0].width <= rows[1].width ? rows[0] : rows[1]
    target.items.push({ space, width })
    target.width = round(target.width + width)
  }

  const totalWidth = round(Math.max(rows[0].width, rows[1].width, MIN_ROOM_WIDTH))
  const totalHeight = round(depth * 2 + corridor)
  const elements: FloorElement[] = []

  rows.forEach((row, rowIndex) => {
    const y = rowIndex === 0 ? 0 : round(depth + corridor)
    // Более короткую галерею центрируем — так схема не выглядит обрубленной
    let x = round((totalWidth - row.width) / 2)
    for (const item of row.items) {
      elements.push({
        type: "rect",
        id: `schema-${item.space.id}`,
        spaceId: item.space.id,
        kind: item.space.kind === "COMMON" ? "common" : "rentable",
        x,
        y,
        width: item.width,
        height: depth,
      })
      x = round(x + item.width)
    }
  })

  elements.push({
    type: "rect",
    id: "schema-corridor",
    kind: "common",
    x: 0,
    y: depth,
    width: totalWidth,
    height: corridor,
    label: "Коридор",
  })

  // Линии галерей — граница коридора
  elements.push({
    type: "wall",
    id: "schema-wall-top",
    x1: 0,
    y1: depth,
    x2: totalWidth,
    y2: depth,
    thickness: 0.2,
  })
  elements.push({
    type: "wall",
    id: "schema-wall-bottom",
    x1: 0,
    y1: round(depth + corridor),
    x2: totalWidth,
    y2: round(depth + corridor),
    thickness: 0.2,
  })

  return {
    version: 2,
    width: totalWidth,
    height: totalHeight,
    source: "schema",
    elements,
  }
}
