// Один разбор плана этажа на весь продукт.
//
// Важное различие, которое до этого размазывалось по трём местам:
// запись плана может существовать и быть пустой. Такой «план» ничего не
// показывает и ничего не защищает — этаж заводили в редакторе и ничего не
// нарисовали. Поэтому план без единого помещения = плана нет.

import { isLayoutV2, type FloorLayoutV2 } from "@/lib/floor-layout"

/** Откуда взялась геометрия этажа. */
export type LayoutKind = "none" | "schema" | "drawn"

function hasRooms(layout: FloorLayoutV2): boolean {
  return layout.elements.some((element) => element.type === "rect" || element.type === "polygon")
}

/** План этажа, если он есть и в нём действительно нарисованы помещения. */
export function readLayout(raw: string | null): FloorLayoutV2 | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isLayoutV2(parsed)) return null
    return hasRooms(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Что у этажа: ничего, схема по площадям или нарисованный план.
 * По этому различию решается и что показывать, и что можно перезаписывать.
 */
export function layoutKind(raw: string | null): LayoutKind {
  const layout = readLayout(raw)
  if (!layout) return "none"
  return layout.source === "schema" ? "schema" : "drawn"
}

/** Сводка по зданию: сколько этажей нарисовано, сколько собрано схемой. */
export function summarizeLayouts(rawList: Array<string | null>): {
  drawn: number
  schema: number
  none: number
} {
  let drawn = 0
  let schema = 0
  let none = 0
  for (const raw of rawList) {
    const kind = layoutKind(raw)
    if (kind === "drawn") drawn += 1
    else if (kind === "schema") schema += 1
    else none += 1
  }
  return { drawn, schema, none }
}
