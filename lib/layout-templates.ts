// Общие шаблоны планов (для всех зданий). Генераторы масштабируются под размер
// этажа/зоны и возвращают FloorLayoutV2, который редактор кладёт в layout —
// дальше владелец правит вручную.
//
// Категории: floor (этаж), roof (крыша), territory (территория/двор/парковка).
//
// Название шаблона и подписи помещений — в словаре (catalogs.layoutTemplates и
// catalogs.layoutLabels). Модуль чистый и уезжает в браузер, поэтому отдаёт
// ключи: имя шаблона берут по nameKey/descriptionKey, а подписи внутри плана
// генератор получает переводчиком — план ложится в базу уже текстом, и текст
// этот должен быть на языке того, кто нажал «создать по шаблону».

import { type FloorLayoutV2, type FloorElement, uid } from "@/lib/floor-layout"

export type TemplateCategory = "floor" | "roof" | "territory"

type TemplateId =
  | "corridor"
  | "openspace"
  | "retail"
  | "perimeter"
  | "roofClean"
  | "roofEquipment"
  | "parkingRows"
  | "yardGreen"

type LabelId =
  | "corridor"
  | "office"
  | "cabinet"
  | "cabinetLeft"
  | "cabinetRight"
  | "openspace"
  | "retailHall"
  | "storeroom"
  | "stairs"
  | "elevator"
  | "toilet"
  | "kitchen"
  | "roof"
  | "techZoneHvac"
  | "techZone"
  | "lawn"
  | "path"
  | "parkingSpot"

/**
 * Переводчик подписей плана: сюда передают t из getT()/useT(). Тип ключа узкий,
 * а не string, — тогда t подходит без приведения (его ключ шире).
 */
export type LayoutLabeller = (
  key: `catalogs.layoutLabels.${LabelId}`,
  vars?: Record<string, string | number>,
) => string

export type LayoutTemplate = {
  id: TemplateId
  nameKey: `catalogs.layoutTemplates.${TemplateId}.name`
  descriptionKey: `catalogs.layoutTemplates.${TemplateId}.description`
  category: TemplateCategory
  width: number
  height: number
  ceilingHeight?: number
  build: (w: number, h: number, label: LayoutLabeller) => FloorElement[]
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
    nameKey: "catalogs.layoutTemplates.corridor.name",
    descriptionKey: "catalogs.layoutTemplates.corridor.description",
    category: "floor",
    width: 30,
    height: 18,
    ceilingHeight: 3,
    build: (w, h, label) => {
      const els: FloorElement[] = []
      const corrH = 2.6
      const cy = h / 2 - corrH / 2
      els.push(rect(0, cy, w, corrH, label("catalogs.layoutLabels.corridor"), "common"))
      const officeH = (h - corrH) / 2
      const cols = Math.max(2, Math.round(w / 6))
      const ow = w / cols
      for (let i = 0; i < cols; i++) {
        els.push(rect(i * ow + 0.1, 0, ow - 0.2, officeH - 0.1, label("catalogs.layoutLabels.office", { n: i + 1 }), "rentable"))
        els.push(rect(i * ow + 0.1, cy + corrH + 0.1, ow - 0.2, officeH - 0.1, label("catalogs.layoutLabels.office", { n: cols + i + 1 }), "rentable"))
      }
      // Лестница + санузел в торце коридора
      els.push(icon("stairs", w - 1.6, cy + corrH / 2, 1.6, label("catalogs.layoutLabels.stairs")))
      els.push(icon("toilet", 1.4, cy + corrH / 2, 1.4, label("catalogs.layoutLabels.toilet")))
      return els
    },
  },
  {
    id: "openspace",
    nameKey: "catalogs.layoutTemplates.openspace.name",
    descriptionKey: "catalogs.layoutTemplates.openspace.description",
    category: "floor",
    width: 26,
    height: 18,
    ceilingHeight: 3,
    build: (w, h, label) => {
      const els: FloorElement[] = []
      const coreW = 5
      els.push(rect(0, 0, w - coreW - 0.3, h, label("catalogs.layoutLabels.openspace"), "rentable"))
      els.push(icon("toilet", w - coreW / 2, h - 2, 2, label("catalogs.layoutLabels.toilet")))
      els.push(icon("kitchen", w - coreW / 2, 2, 2, label("catalogs.layoutLabels.kitchen")))
      els.push(icon("stairs", w - coreW / 2, h / 2, 1.8, label("catalogs.layoutLabels.stairs")))
      return els
    },
  },
  {
    id: "retail",
    nameKey: "catalogs.layoutTemplates.retail.name",
    descriptionKey: "catalogs.layoutTemplates.retail.description",
    category: "floor",
    width: 22,
    height: 16,
    ceilingHeight: 3.5,
    build: (w, h, label) => {
      const els: FloorElement[] = []
      const backH = 4
      els.push(rect(0, 0, w, h - backH - 0.2, label("catalogs.layoutLabels.retailHall"), "rentable"))
      els.push(rect(0, h - backH, w * 0.6, backH, label("catalogs.layoutLabels.storeroom"), "common"))
      els.push(icon("toilet", w - 1.6, h - backH / 2, 1.6, label("catalogs.layoutLabels.toilet")))
      return els
    },
  },
  {
    id: "perimeter",
    nameKey: "catalogs.layoutTemplates.perimeter.name",
    descriptionKey: "catalogs.layoutTemplates.perimeter.description",
    category: "floor",
    width: 28,
    height: 20,
    ceilingHeight: 3,
    build: (w, h, label) => {
      const els: FloorElement[] = []
      const d = 6 // глубина кабинета
      // Верхний и нижний ряды
      const topCols = Math.max(2, Math.round(w / 6))
      const cw = w / topCols
      for (let i = 0; i < topCols; i++) {
        els.push(rect(i * cw + 0.1, 0, cw - 0.2, d - 0.1, label("catalogs.layoutLabels.cabinet", { n: i + 1 }), "rentable"))
        els.push(rect(i * cw + 0.1, h - d + 0.1, cw - 0.2, d - 0.1, label("catalogs.layoutLabels.cabinet", { n: topCols + i + 1 }), "rentable"))
      }
      // Боковые
      els.push(rect(0, d + 0.1, d - 0.1, h - 2 * d - 0.2, label("catalogs.layoutLabels.cabinetLeft"), "rentable"))
      els.push(rect(w - d + 0.1, d + 0.1, d - 0.1, h - 2 * d - 0.2, label("catalogs.layoutLabels.cabinetRight"), "rentable"))
      // Ядро в центре
      els.push(icon("elevator", w / 2 - 1.6, h / 2, 1.8, label("catalogs.layoutLabels.elevator")))
      els.push(icon("stairs", w / 2 + 1.6, h / 2, 1.8, label("catalogs.layoutLabels.stairs")))
      els.push(icon("toilet", w / 2, h / 2 + 2.2, 1.6, label("catalogs.layoutLabels.toilet")))
      return els
    },
  },
  {
    id: "roofClean",
    nameKey: "catalogs.layoutTemplates.roofClean.name",
    descriptionKey: "catalogs.layoutTemplates.roofClean.description",
    category: "roof",
    width: 30,
    height: 18,
    build: (w, h, label) => [rect(0, 0, w, h, label("catalogs.layoutLabels.roof"), "common")],
  },
  {
    id: "roofEquipment",
    nameKey: "catalogs.layoutTemplates.roofEquipment.name",
    descriptionKey: "catalogs.layoutTemplates.roofEquipment.description",
    category: "roof",
    width: 30,
    height: 18,
    build: (w, h, label) => {
      const els: FloorElement[] = []
      els.push(rect(0, 0, w, h, label("catalogs.layoutLabels.roof"), "common"))
      els.push(rect(1, 1, 5, 4, label("catalogs.layoutLabels.techZoneHvac"), "common"))
      els.push(rect(w - 6, 1, 5, 4, label("catalogs.layoutLabels.techZone"), "common"))
      return els
    },
  },
  {
    id: "parkingRows",
    nameKey: "catalogs.layoutTemplates.parkingRows.name",
    descriptionKey: "catalogs.layoutTemplates.parkingRows.description",
    category: "territory",
    width: 30,
    height: 22,
    build: (w, h, label) => {
      const els: FloorElement[] = []
      const stallW = 2.6
      const stallD = 5
      const aisle = 6
      const cols = Math.max(1, Math.floor(w / stallW))
      let n = 1
      for (let y = 0; y + stallD <= h; y += stallD + aisle) {
        for (let c = 0; c < cols; c++) {
          els.push(icon("parking", c * stallW + stallW / 2, y + stallD / 2, Math.min(stallW, stallD) * 0.9, label("catalogs.layoutLabels.parkingSpot", { n: n++ })))
        }
      }
      return els
    },
  },
  {
    id: "yardGreen",
    nameKey: "catalogs.layoutTemplates.yardGreen.name",
    descriptionKey: "catalogs.layoutTemplates.yardGreen.description",
    category: "territory",
    width: 26,
    height: 20,
    build: (w, h, label) => {
      const els: FloorElement[] = []
      els.push(rect(0, 0, w, h, label("catalogs.layoutLabels.lawn"), "common"))
      els.push(rect(w / 2 - 1.5, 0, 3, h, label("catalogs.layoutLabels.path"), "common"))
      for (let i = 0; i < 4; i++) {
        els.push(icon("parking", 1.6 + i * 2.8, h - 2.5, 2.2, label("catalogs.layoutLabels.parkingSpot", { n: i + 1 })))
      }
      return els
    },
  },
]

/**
 * Собрать готовый layout из шаблона. Параметр назван template, а не t, чтобы не
 * затенять переводчик подписей.
 */
export function buildLayoutFromTemplate(template: LayoutTemplate, label: LayoutLabeller): FloorLayoutV2 {
  return {
    version: 2,
    width: template.width,
    height: template.height,
    ceilingHeight: template.ceilingHeight ?? null,
    elements: template.build(template.width, template.height, label),
  }
}

export function templatesForCategory(category: TemplateCategory): LayoutTemplate[] {
  return LAYOUT_TEMPLATES.filter((t) => t.category === category)
}
