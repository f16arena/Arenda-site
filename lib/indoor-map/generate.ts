// Сборка схемы этажа из уже заведённых помещений (SPEC §6, путь 3).
//
// Это НЕ обмерный план: настоящую геометрию даёт только обводка по подложке.
// Но пока плана нет, карта пустая, а у собственника уже есть список помещений
// с площадями — из них собирается честная схема.
//
// Два правила, без которых схема выглядит мусором:
//
//  1. Контур один на всё здание. Если раскладывать каждый этаж сам по себе,
//     этажи выходят разного размера и в объёме не складываются в здание —
//     получается стопка полос разной длины.
//  2. Внутри контура — squarified treemap, а не ряды. Раскладка рядами при
//     разбросе площадей (одно помещение 600 м² и два по 20) даёт стометровую
//     кишку. Treemap режет так, чтобы помещения выходили близкими к квадрату,
//     сохраняя площадь каждого точно.
//
// Тот же алгоритм применялся в сборщике модели здания (lib/builder), здесь он
// повторён в метрах и без зависимости от того модуля.

import type { FloorElement, FloorLayoutV2 } from "@/lib/floor-layout"

export type SchemaSpace = {
  id: string
  number: string
  area: number
  kind: string
}

/** Прямоугольный контур здания в метрах. */
export type SchemaFootprint = { width: number; height: number }

/** Ширина к глубине обычного офисного корпуса. */
const RATIO = 1.6

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Контур считается по самому большому этажу: тогда все этажи помещаются
 * внутрь одного прямоугольника и стопка выглядит зданием.
 */
export function buildingFootprint(floorAreas: number[], ratio = RATIO): SchemaFootprint | null {
  const maxArea = Math.max(0, ...floorAreas.filter((area) => Number.isFinite(area)))
  if (maxArea <= 0) return null
  const height = Math.sqrt(maxArea / ratio)
  return { width: round(maxArea / height), height: round(height) }
}

type Rect = { x: number; y: number; w: number; h: number }
type Cell = { id: string | null; space: SchemaSpace | null; area: number }

/** Худшее соотношение сторон в ряду — критерий остановки treemap. */
function worstRatio(areas: number[], side: number): number {
  const sum = areas.reduce((a, b) => a + b, 0)
  if (sum <= 0) return Infinity
  const max = Math.max(...areas)
  const min = Math.min(...areas)
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
}

function squarify(cells: Cell[], rect: Rect): Array<{ cell: Cell; rect: Rect }> {
  const out: Array<{ cell: Cell; rect: Rect }> = []
  const total = cells.reduce((sum, cell) => sum + cell.area, 0)
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return out

  // площади масштабируем под контур, пропорции между помещениями сохраняются
  const scale = (rect.w * rect.h) / total
  const items = cells
    .map((cell) => ({ cell, a: cell.area * scale }))
    .sort((left, right) => right.a - left.a)

  let free: Rect = { ...rect }
  let index = 0
  while (index < items.length) {
    const side = Math.min(free.w, free.h)
    const row = [items[index]]
    index += 1
    while (index < items.length) {
      const withNext = row.concat([items[index]]).map((item) => item.a)
      if (worstRatio(withNext, side) <= worstRatio(row.map((item) => item.a), side)) {
        row.push(items[index])
        index += 1
      } else break
    }

    const rowArea = row.reduce((sum, item) => sum + item.a, 0)
    if (free.w >= free.h) {
      const rowWidth = rowArea / free.h
      let y = free.y
      for (const item of row) {
        const height = item.a / rowWidth
        out.push({ cell: item.cell, rect: { x: free.x, y, w: rowWidth, h: height } })
        y += height
      }
      free = { x: free.x + rowWidth, y: free.y, w: free.w - rowWidth, h: free.h }
    } else {
      const rowHeight = rowArea / free.w
      let x = free.x
      for (const item of row) {
        const width = item.a / rowHeight
        out.push({ cell: item.cell, rect: { x, y: free.y, w: width, h: rowHeight } })
        x += width
      }
      free = { x: free.x, y: free.y + rowHeight, w: free.w, h: free.h - rowHeight }
    }
  }
  return out
}

export type SchemaOptions = {
  /** общий контур здания; без него считается по этому же этажу */
  footprint?: SchemaFootprint | null
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

  const floorArea = usable.reduce((sum, space) => sum + space.area, 0)
  const footprint = options.footprint ?? buildingFootprint([floorArea])
  if (!footprint) return null

  const cells: Cell[] = usable.map((space) => ({ id: space.id, space, area: space.area }))

  // Остаток контура — коридоры, лестницы и санузлы, которых нет в карточках.
  // Без него помещения растянулись бы на весь этаж и площади поехали.
  const footprintArea = footprint.width * footprint.height
  const rest = footprintArea - floorArea
  if (rest > footprintArea * 0.02) {
    cells.push({ id: null, space: null, area: rest })
  }

  const placed = squarify(cells, { x: 0, y: 0, w: footprint.width, h: footprint.height })
  const elements: FloorElement[] = placed.map(({ cell, rect }, index) => ({
    type: "rect",
    id: cell.space ? `schema-${cell.space.id}` : `schema-common-${index}`,
    spaceId: cell.space?.id ?? null,
    kind: cell.space ? (cell.space.kind === "COMMON" ? "common" : "rentable") : "common",
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.w),
    height: round(rect.h),
    ...(cell.space ? {} : { label: "Общая зона" }),
  }))

  return {
    version: 2,
    width: round(footprint.width),
    height: round(footprint.height),
    source: "schema",
    elements,
  }
}
