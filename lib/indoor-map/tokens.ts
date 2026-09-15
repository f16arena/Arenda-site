// Визуальная система indoor-карты. Источник правды — docs/indoor-map/SPEC.md §3.
// Палитра наследует токены лендинга (components/landing/v2): синий #1f54d6,
// оранжевый #e8762b, зелёный #0d9b6c, чернильный #0a1020.
//
// Бумага карты всегда светлая, как у печатного плана, — в тёмной теме
// меняется только подложка страницы вокруг неё.

export type RoomStatus = "VACANT" | "OCCUPIED" | "EXPIRING" | "MAINTENANCE" | "COMMON"

export type StatusStyle = {
  fill: string
  edge: string
  ink: string
  label: string
}

export const STATUS_STYLE: Record<RoomStatus, StatusStyle> = {
  VACANT: { fill: "#e3f5ee", edge: "#0d9b6c", ink: "#0a5c41", label: "Свободно" },
  OCCUPIED: { fill: "#eaf0fe", edge: "#1f54d6", ink: "#143a9e", label: "Занято" },
  EXPIRING: { fill: "#fdf0e2", edge: "#e8762b", ink: "#a8480f", label: "Освобождается" },
  MAINTENANCE: { fill: "#f4f6f9", edge: "#9aa3b5", ink: "#4f596d", label: "Не сдаётся" },
  COMMON: { fill: "#ffffff", edge: "#dfe4ee", ink: "#8b94a6", label: "Общая зона" },
}

// Порядок в легенде и в фильтрах
export const STATUS_ORDER: RoomStatus[] = ["VACANT", "EXPIRING", "OCCUPIED", "MAINTENANCE"]

export const PAPER = {
  ground: "#edf0f5", // фон вокруг здания
  plate: "#f6f8fc", // плита этажа: чуть темнее коридоров, иначе они не читаются
  slab: "#dfe5ef", // перекрытие в объёме: из них складывается полосатый бок здания
  outline: "#dce2ec", // контур этажа
  wall: "#46516a", // несущая линия
  opening: "#ffffff", // проём двери/окна
  glyph: "#5a6478", // служебные знаки
  glyphSoft: "#aeb6c6",
} as const

// Толщины линий в пикселях экрана — НЕ в метрах: линия не должна толстеть
// при зуме, иначе план превращается в кашу (SPEC §3, критерий приёмки 1).
export const STROKE = {
  room: 1.25,
  roomSelected: 2.5,
  common: 1,
  wall: 1.6,
  hairline: 0.75,
} as const

// Уровни детализации по зуму (пикселей на метр). SPEC §3, «Детализация по зуму».
export type Detail = "far" | "mid" | "near"

export function detailFor(pxPerMeter: number): Detail {
  if (pxPerMeter < 9) return "far"
  if (pxPerMeter < 19) return "mid"
  return "near"
}

export const ZOOM_MIN = 3
export const ZOOM_MAX = 80

// Категории арендаторов — свой набор, не копия чужого.
export type TenantCategory =
  | "retail"
  | "food"
  | "services"
  | "beauty"
  | "kids"
  | "electronics"
  | "health"
  | "bank"
  | "office"
  | "other"

export const CATEGORY_LABEL: Record<TenantCategory, string> = {
  retail: "Одежда и товары",
  food: "Еда и кафе",
  services: "Услуги",
  beauty: "Красота",
  kids: "Детское",
  electronics: "Техника",
  health: "Здоровье",
  bank: "Банк",
  office: "Офис",
  other: "Прочее",
}
