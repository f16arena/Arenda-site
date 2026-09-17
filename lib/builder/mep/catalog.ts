// Каталог инженерных систем и приборов для раздела «Сети» конструктора.
//
// Марки и названия — по привычным для проектировщика разделам: ЭМ (силовое
// электрооборудование), ЭО (электроосвещение), СС (сети связи и слаботочка),
// ВК (водопровод В1, горячая вода Т3, канализация К1), ОВ (отопление, вентиляция).
// Цвета — различимые на тёмном 3D-фоне и на белом листе чертежа.

import type { MepSystem } from "@/types/builder"

export type MepSection = "ЭМ" | "ЭО" | "СС" | "ВК" | "ОВ"

export interface MepSystemInfo {
  id: MepSystem
  name: string
  section: MepSection
  /** марка сети на чертеже: В1, Т3, К1… */
  mark: string
  color: string
  /** трасса по умолчанию: высота от пола этажа, мм */
  runHeight: number
  /** марка кабеля / диаметр трубы / сечение воздуховода по умолчанию */
  size: string
  /** что тянем: для подписи в спецификации */
  runNoun: string
  /** как выглядит трасса в 3D */
  shape: "cable" | "pipe" | "duct"
}

export const MEP_SYSTEM_INFO: Record<MepSystem, MepSystemInfo> = {
  power: { id: "power", name: "Силовая сеть", section: "ЭМ", mark: "ЭМ", color: "#E11D48", runHeight: 2800, size: "ВВГнг(А)-LS 3×2,5", runNoun: "Кабель", shape: "cable" },
  lighting: { id: "lighting", name: "Освещение", section: "ЭО", mark: "ЭО", color: "#EAB308", runHeight: 2900, size: "ВВГнг(А)-LS 3×1,5", runNoun: "Кабель", shape: "cable" },
  lowcurrent: { id: "lowcurrent", name: "Слаботочные сети", section: "СС", mark: "СС", color: "#9333EA", runHeight: 2900, size: "U/UTP кат. 6", runNoun: "Кабель", shape: "cable" },
  water: { id: "water", name: "Водопровод холодный", section: "ВК", mark: "В1", color: "#2563EB", runHeight: 400, size: "PP-R Ø25", runNoun: "Труба", shape: "pipe" },
  hotwater: { id: "hotwater", name: "Горячая вода", section: "ВК", mark: "Т3", color: "#F97316", runHeight: 450, size: "PP-R Ø25", runNoun: "Труба", shape: "pipe" },
  sewer: { id: "sewer", name: "Канализация", section: "ВК", mark: "К1", color: "#92400E", runHeight: 150, size: "ПП Ø110", runNoun: "Труба", shape: "pipe" },
  heating: { id: "heating", name: "Отопление", section: "ОВ", mark: "Т1", color: "#DB2777", runHeight: 200, size: "Сталь Ду20", runNoun: "Труба", shape: "pipe" },
  ventilation: { id: "ventilation", name: "Вентиляция", section: "ОВ", mark: "В", color: "#059669", runHeight: 2900, size: "300×200", runNoun: "Воздуховод", shape: "duct" },
}

/** Условное обозначение прибора на плане. */
export type MepSymbol =
  | "panel" // щит: прямоугольник с диагональной заливкой
  | "socket" // розетка: полукруг
  | "socket2" // двойная розетка
  | "switch" // выключатель: кружок с черточкой
  | "lamp" // светильник: круг с крестом
  | "lampPanel" // светильник-панель: квадрат с крестом
  | "exit" // аварийный «Выход»: прямоугольник с Э
  | "data" // информационная розетка: треугольник
  | "camera" // камера
  | "detector" // извещатель: круг с точкой
  | "riser" // стояк: круг с маркой
  | "fixture" // сантехприбор: прямоугольник со скруглением
  | "drain" // трап: квадрат с кругом
  | "radiator" // радиатор: вытянутый прямоугольник со штриховкой
  | "diffuser" // диффузор: квадрат с крестом по диагоналям
  | "equipment" // оборудование: прямоугольник с подписью

export interface MepDeviceInfo {
  kind: string
  system: MepSystem
  name: string
  symbol: MepSymbol
  /** высота установки от пола, мм; "ceiling" — под потолком этажа */
  height: number | "ceiling"
  /** габарит для 3D, мм: ширина (вдоль стены), глубина, высота */
  box: { w: number; d: number; h: number }
  /** ставится на стену (прижимается к ближайшей и разворачивается) */
  wall?: boolean
  /** вертикальный стояк во всю высоту этажа */
  riser?: boolean
  /** мощность по умолчанию, Вт */
  power?: number
}

const D = (x: MepDeviceInfo) => x

export const MEP_DEVICES: MepDeviceInfo[] = [
  // ЭМ
  D({ kind: "panel", system: "power", name: "Щит распределительный", symbol: "panel", height: 1500, box: { w: 500, d: 150, h: 700 }, wall: true }),
  D({ kind: "socket", system: "power", name: "Розетка", symbol: "socket", height: 300, box: { w: 80, d: 40, h: 80 }, wall: true, power: 300 }),
  D({ kind: "socket2", system: "power", name: "Розетка двойная", symbol: "socket2", height: 300, box: { w: 150, d: 40, h: 80 }, wall: true, power: 600 }),
  D({ kind: "socket380", system: "power", name: "Силовая розетка 380 В", symbol: "socket", height: 1000, box: { w: 100, d: 90, h: 120 }, wall: true, power: 3000 }),
  D({ kind: "ac", system: "power", name: "Кондиционер (питание)", symbol: "equipment", height: 2400, box: { w: 800, d: 200, h: 280 }, wall: true, power: 1000 }),
  // ЭО
  D({ kind: "lamp", system: "lighting", name: "Светильник потолочный", symbol: "lamp", height: "ceiling", box: { w: 300, d: 300, h: 80 }, power: 20 }),
  D({ kind: "lampPanel", system: "lighting", name: "Светильник-панель 600×600", symbol: "lampPanel", height: "ceiling", box: { w: 600, d: 600, h: 40 }, power: 36 }),
  D({ kind: "switch", system: "lighting", name: "Выключатель", symbol: "switch", height: 900, box: { w: 80, d: 40, h: 80 }, wall: true }),
  D({ kind: "exit", system: "lighting", name: "Аварийный указатель «Выход»", symbol: "exit", height: 2300, box: { w: 350, d: 50, h: 150 }, wall: true, power: 5 }),
  // СС
  D({ kind: "data", system: "lowcurrent", name: "Розетка RJ-45", symbol: "data", height: 300, box: { w: 80, d: 40, h: 80 }, wall: true }),
  D({ kind: "camera", system: "lowcurrent", name: "Камера видеонаблюдения", symbol: "camera", height: 2700, box: { w: 120, d: 200, h: 120 }, wall: true, power: 6 }),
  D({ kind: "smoke", system: "lowcurrent", name: "Извещатель дымовой", symbol: "detector", height: "ceiling", box: { w: 110, d: 110, h: 50 } }),
  D({ kind: "rack", system: "lowcurrent", name: "Шкаф телекоммуникационный", symbol: "equipment", height: 0, box: { w: 600, d: 600, h: 1200 }, wall: true, power: 500 }),
  // ВК
  D({ kind: "riserB1", system: "water", name: "Стояк В1", symbol: "riser", height: 0, box: { w: 32, d: 32, h: 0 }, riser: true }),
  D({ kind: "meter", system: "water", name: "Водомерный узел", symbol: "equipment", height: 500, box: { w: 400, d: 150, h: 200 }, wall: true }),
  D({ kind: "sink", system: "water", name: "Умывальник", symbol: "fixture", height: 850, box: { w: 500, d: 400, h: 150 }, wall: true }),
  D({ kind: "toilet", system: "water", name: "Унитаз", symbol: "fixture", height: 0, box: { w: 380, d: 650, h: 400 }, wall: true }),
  D({ kind: "riserT3", system: "hotwater", name: "Стояк Т3", symbol: "riser", height: 0, box: { w: 32, d: 32, h: 0 }, riser: true }),
  D({ kind: "heater", system: "hotwater", name: "Водонагреватель", symbol: "equipment", height: 1200, box: { w: 450, d: 450, h: 800 }, wall: true, power: 2000 }),
  D({ kind: "riserK1", system: "sewer", name: "Стояк К1", symbol: "riser", height: 0, box: { w: 110, d: 110, h: 0 }, riser: true }),
  D({ kind: "drain", system: "sewer", name: "Трап", symbol: "drain", height: 0, box: { w: 150, d: 150, h: 20 } }),
  D({ kind: "cleanout", system: "sewer", name: "Ревизия", symbol: "detector", height: 1000, box: { w: 110, d: 110, h: 110 }, wall: true }),
  // ОВ
  D({ kind: "radiator", system: "heating", name: "Радиатор", symbol: "radiator", height: 150, box: { w: 1000, d: 100, h: 500 }, wall: true }),
  D({ kind: "riserT1", system: "heating", name: "Стояк отопления", symbol: "riser", height: 0, box: { w: 32, d: 32, h: 0 }, riser: true }),
  D({ kind: "boiler", system: "heating", name: "Котёл", symbol: "equipment", height: 800, box: { w: 450, d: 350, h: 750 }, wall: true, power: 24000 }),
  D({ kind: "supply", system: "ventilation", name: "Диффузор приточный", symbol: "diffuser", height: "ceiling", box: { w: 400, d: 400, h: 60 } }),
  D({ kind: "exhaust", system: "ventilation", name: "Решётка вытяжная", symbol: "diffuser", height: "ceiling", box: { w: 400, d: 400, h: 60 } }),
  D({ kind: "fan", system: "ventilation", name: "Вентилятор канальный", symbol: "equipment", height: "ceiling", box: { w: 400, d: 400, h: 300 }, power: 150 }),
]

export const MEP_DEVICE_BY_KIND: Record<string, MepDeviceInfo> = Object.fromEntries(MEP_DEVICES.map((d) => [d.kind, d]))

export function devicesOf(system: MepSystem): MepDeviceInfo[] {
  return MEP_DEVICES.filter((d) => d.system === system)
}

/** Высота установки прибора с учётом «под потолком». */
export function deviceHeight(info: MepDeviceInfo, floorHeight: number): number {
  return info.height === "ceiling" ? Math.max(0, floorHeight - info.box.h - 50) : info.height
}

/** Диаметр трубы/кабеля в мм из марки: «Ø25», «Ду20», «3×2,5» → оценка. */
export function runDiameterMm(system: MepSystem, size: string): number {
  const info = MEP_SYSTEM_INFO[system]
  const m = size.match(/(?:Ø|Ду|DN|d)\s*(\d+(?:[.,]\d+)?)/i)
  if (m) return Math.max(10, parseFloat(m[1].replace(",", ".")))
  return info.shape === "cable" ? 14 : info.shape === "pipe" ? 25 : 200
}

/** Сечение воздуховода «300×200» (мм) или круглого «Ø200». */
export function ductSection(size: string): { w: number; h: number } {
  const rect = size.match(/(\d+)\s*[×xх*]\s*(\d+)/i)
  if (rect) return { w: Math.max(50, parseInt(rect[1], 10)), h: Math.max(50, parseInt(rect[2], 10)) }
  const round = size.match(/(?:Ø|d)\s*(\d+)/i)
  if (round) {
    const d = Math.max(50, parseInt(round[1], 10))
    return { w: d, h: d }
  }
  return { w: 300, h: 200 }
}

export function polylineLengthMm(points: { x: number; y: number }[]): number {
  let L = 0
  for (let i = 1; i < points.length; i++) L += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  return L
}
