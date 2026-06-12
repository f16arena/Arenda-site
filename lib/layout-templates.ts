// Общие шаблоны планов (для всех зданий). Генераторы масштабируются под размер
// этажа/зоны и возвращают FloorLayoutV2, который редактор кладёт в layout —
// дальше владелец правит вручную.
//
// Категории: floor (этаж), roof (крыша), territory (территория/двор/парковка).

import { type FloorLayoutV2, type FloorElement, uid } from "@/lib/floor-layout"

export type TemplateCategory = "floor" | "roof" | "territory"

export type LayoutTemplate = {
  id: string
  name: string
  description: string
  category: TemplateCategory
  width: number
  height: number
  ceilingHeight?: number
  build: (w: number, h: number) => FloorElement[]
}

function rect(x: number, y: number, w: number, h: number, label: string, kind: "rentable" | "common"): FloorElement {
  return { type: "rect", id: uid(), kind, x, y, width: w, height: h, label }
}
function icon(kind: "stairs" | "elevator" | "toilet" | "kitchen" | "parking", x: number, y: number, size: number, label?: string): FloorElement {
  return { type: "icon", id: uid(), kind, x, y, size, label }
}

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: "corridor",
    name: "Коридорная планировка",
    description: "Центральный коридор, офисы по обе стороны",
    category: "floor",
    width: 30,
    height: 18,
    ceilingHeight: 3,
    build: (w, h) => {
      const els: FloorElement[] = []
      const corrH = 2.6
      const cy = h / 2 - corrH / 2
      els.push(rect(0, cy, w, corrH, "Коридор", "common"))
      const officeH = (h - corrH) / 2
      const cols = Math.max(2, Math.round(w / 6))
      const ow = w / cols
      for (let i = 0; i < cols; i++) {
        els.push(rect(i * ow + 0.1, 0, ow - 0.2, officeH - 0.1, `Офис ${i + 1}`, "rentable"))
        els.push(rect(i * ow + 0.1, cy + corrH + 0.1, ow - 0.2, officeH - 0.1, `Офис ${cols + i + 1}`, "rentable"))
      }
      // Лестница + санузел в торце коридора
      els.push(icon("stairs", w - 1.6, cy + corrH / 2, 1.6, "Лестница"))
      els.push(icon("toilet", 1.4, cy + corrH / 2, 1.4, "Санузел"))
      return els
    },
  },
  {
    id: "openspace",
    name: "Опенспейс",
    description: "Один большой зал + санузел и кухня",
    category: "floor",
    width: 26,
    height: 18,
    ceilingHeight: 3,
    build: (w, h) => {
      const els: FloorElement[] = []
      const coreW = 5
      els.push(rect(0, 0, w - coreW - 0.3, h, "Опенспейс", "rentable"))
      els.push(icon("toilet", w - coreW / 2, h - 2, 2, "Санузел"))
      els.push(icon("kitchen", w - coreW / 2, 2, 2, "Кухня"))
      els.push(icon("stairs", w - coreW / 2, h / 2, 1.8, "Лестница"))
      return els
    },
  },
  {
    id: "retail",
    name: "Ритейл / магазин",
    description: "Большой торговый зал + подсобка и санузел",
    category: "floor",
    width: 22,
    height: 16,
    ceilingHeight: 3.5,
    build: (w, h) => {
      const els: FloorElement[] = []
      const backH = 4
      els.push(rect(0, 0, w, h - backH - 0.2, "Торговый зал", "rentable"))
      els.push(rect(0, h - backH, w * 0.6, backH, "Подсобка", "common"))
      els.push(icon("toilet", w - 1.6, h - backH / 2, 1.6, "Санузел"))
      return els
    },
  },
  {
    id: "perimeter",
    name: "Кабинеты по периметру",
    description: "Ядро (лифт/лестница/санузел) в центре, кабинеты вокруг",
    category: "floor",
    width: 28,
    height: 20,
    ceilingHeight: 3,
    build: (w, h) => {
      const els: FloorElement[] = []
      const d = 6 // глубина кабинета
      // Верхний и нижний ряды
      const topCols = Math.max(2, Math.round(w / 6))
      const cw = w / topCols
      for (let i = 0; i < topCols; i++) {
        els.push(rect(i * cw + 0.1, 0, cw - 0.2, d - 0.1, `Каб. ${i + 1}`, "rentable"))
        els.push(rect(i * cw + 0.1, h - d + 0.1, cw - 0.2, d - 0.1, `Каб. ${topCols + i + 1}`, "rentable"))
      }
      // Боковые
      els.push(rect(0, d + 0.1, d - 0.1, h - 2 * d - 0.2, "Каб. A", "rentable"))
      els.push(rect(w - d + 0.1, d + 0.1, d - 0.1, h - 2 * d - 0.2, "Каб. B", "rentable"))
      // Ядро в центре
      els.push(icon("elevator", w / 2 - 1.6, h / 2, 1.8, "Лифт"))
      els.push(icon("stairs", w / 2 + 1.6, h / 2, 1.8, "Лестница"))
      els.push(icon("toilet", w / 2, h / 2 + 2.2, 1.6, "Санузел"))
      return els
    },
  },
  {
    id: "roof-clean",
    name: "Кровля (контур)",
    description: "Чистая кровля — площадка под объекты (антенны, оборудование)",
    category: "roof",
    width: 30,
    height: 18,
    build: (w, h) => [rect(0, 0, w, h, "Кровля", "common")],
  },
  {
    id: "roof-equipment",
    name: "Кровля с оборудованием",
    description: "Контур + технические зоны под HVAC и мачты",
    category: "roof",
    width: 30,
    height: 18,
    build: (w, h) => {
      const els: FloorElement[] = []
      els.push(rect(0, 0, w, h, "Кровля", "common"))
      els.push(rect(1, 1, 5, 4, "Тех. зона (HVAC)", "common"))
      els.push(rect(w - 6, 1, 5, 4, "Тех. зона", "common"))
      return els
    },
  },
  {
    id: "parking-rows",
    name: "Парковка рядами",
    description: "Сетка парковочных мест с проездами",
    category: "territory",
    width: 30,
    height: 22,
    build: (w, h) => {
      const els: FloorElement[] = []
      const stallW = 2.6
      const stallD = 5
      const aisle = 6
      const cols = Math.max(1, Math.floor(w / stallW))
      let n = 1
      for (let y = 0; y + stallD <= h; y += stallD + aisle) {
        for (let c = 0; c < cols; c++) {
          els.push(icon("parking", c * stallW + stallW / 2, y + stallD / 2, Math.min(stallW, stallD) * 0.9, `P${n++}`))
        }
      }
      return els
    },
  },
  {
    id: "yard-green",
    name: "Двор с озеленением",
    description: "Зелёная зона, дорожки и несколько парковочных мест",
    category: "territory",
    width: 26,
    height: 20,
    build: (w, h) => {
      const els: FloorElement[] = []
      els.push(rect(0, 0, w, h, "Газон", "common"))
      els.push(rect(w / 2 - 1.5, 0, 3, h, "Дорожка", "common"))
      for (let i = 0; i < 4; i++) {
        els.push(icon("parking", 1.6 + i * 2.8, h - 2.5, 2.2, `P${i + 1}`))
      }
      return els
    },
  },
]

/** Собрать готовый layout из шаблона. */
export function buildLayoutFromTemplate(t: LayoutTemplate): FloorLayoutV2 {
  return {
    version: 2,
    width: t.width,
    height: t.height,
    ceilingHeight: t.ceilingHeight ?? null,
    elements: t.build(t.width, t.height),
  }
}

export function templatesForCategory(category: TemplateCategory): LayoutTemplate[] {
  return LAYOUT_TEMPLATES.filter((t) => t.category === category)
}
