// Каталог инженерных систем и приборов для раздела «Сети» конструктора.
//
// Марки и названия — по привычным для проектировщика разделам: ЭМ (силовое
// электрооборудование), ЭО (электроосвещение), СС (сети связи и слаботочка),
// ВК (водопровод В1, горячая вода Т3, канализация К1), ОВ (отопление, вентиляция).
// Цвета — различимые на тёмном 3D-фоне и на белом листе чертежа.
//
// Названия систем и приборов — в словаре (adminBuilder.mep): ключ системы это
// её id, ключ прибора — его kind. Марки разделов и сетей по ГОСТ остаются здесь:
// В1 и ЭО стоят на чертеже одинаково на любом языке.

import type { MepSystem } from "@/types/builder"
import type { Messages } from "@/lib/i18n/messages"

export type MepSection = "ЭМ" | "ЭО" | "СС" | "ВК" | "ОВ"

/** Ключ названия прибора в словаре — он же его kind. */
export type MepDeviceNameKey = keyof Messages["adminBuilder"]["mep"]["devices"]

export interface MepSystemInfo {
  id: MepSystem
  section: MepSection
  /** марка сети на чертеже: В1, Т3, К1… */
  mark: string
  color: string
  /** трасса по умолчанию: высота от пола этажа, мм */
  runHeight: number
  /** марка кабеля / диаметр трубы / сечение воздуховода по умолчанию */
  size: string
  /** как выглядит трасса в 3D; он же задаёт, что тянем: кабель, труба, воздуховод */
  shape: "cable" | "pipe" | "duct"
}

export const MEP_SYSTEM_INFO: Record<MepSystem, MepSystemInfo> = {
  power: { id: "power", section: "ЭМ", mark: "ЭМ", color: "#E11D48", runHeight: 2800, size: "ВВГнг(А)-LS 3×2,5", shape: "cable" },
  lighting: { id: "lighting", section: "ЭО", mark: "ЭО", color: "#EAB308", runHeight: 2900, size: "ВВГнг(А)-LS 3×1,5", shape: "cable" },
  lowcurrent: { id: "lowcurrent", section: "СС", mark: "СС", color: "#9333EA", runHeight: 2900, size: "U/UTP кат. 6", shape: "cable" },
  water: { id: "water", section: "ВК", mark: "В1", color: "#2563EB", runHeight: 400, size: "PP-R Ø25", shape: "pipe" },
  hotwater: { id: "hotwater", section: "ВК", mark: "Т3", color: "#F97316", runHeight: 450, size: "PP-R Ø25", shape: "pipe" },
  sewer: { id: "sewer", section: "ВК", mark: "К1", color: "#92400E", runHeight: 150, size: "ПП Ø110", shape: "pipe" },
  heating: { id: "heating", section: "ОВ", mark: "Т1", color: "#DB2777", runHeight: 200, size: "Сталь Ду20", shape: "pipe" },
  ventilation: { id: "ventilation", section: "ОВ", mark: "В", color: "#059669", runHeight: 2900, size: "300×200", shape: "duct" },
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
  kind: MepDeviceNameKey
  system: MepSystem
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
  D({ kind: "panel", system: "power", symbol: "panel", height: 1500, box: { w: 500, d: 150, h: 700 }, wall: true }),
  D({ kind: "socket", system: "power", symbol: "socket", height: 300, box: { w: 80, d: 40, h: 80 }, wall: true, power: 300 }),
  D({ kind: "socket2", system: "power", symbol: "socket2", height: 300, box: { w: 150, d: 40, h: 80 }, wall: true, power: 600 }),
  D({ kind: "socket380", system: "power", symbol: "socket", height: 1000, box: { w: 100, d: 90, h: 120 }, wall: true, power: 3000 }),
  D({ kind: "ac", system: "power", symbol: "equipment", height: 2400, box: { w: 800, d: 200, h: 280 }, wall: true, power: 1000 }),
  // ЭО
  D({ kind: "lamp", system: "lighting", symbol: "lamp", height: "ceiling", box: { w: 300, d: 300, h: 80 }, power: 20 }),
  D({ kind: "lampPanel", system: "lighting", symbol: "lampPanel", height: "ceiling", box: { w: 600, d: 600, h: 40 }, power: 36 }),
  D({ kind: "switch", system: "lighting", symbol: "switch", height: 900, box: { w: 80, d: 40, h: 80 }, wall: true }),
  D({ kind: "exit", system: "lighting", symbol: "exit", height: 2300, box: { w: 350, d: 50, h: 150 }, wall: true, power: 5 }),
  // СС
  D({ kind: "data", system: "lowcurrent", symbol: "data", height: 300, box: { w: 80, d: 40, h: 80 }, wall: true }),
  D({ kind: "camera", system: "lowcurrent", symbol: "camera", height: 2700, box: { w: 120, d: 200, h: 120 }, wall: true, power: 6 }),
  D({ kind: "smoke", system: "lowcurrent", symbol: "detector", height: "ceiling", box: { w: 110, d: 110, h: 50 } }),
  D({ kind: "rack", system: "lowcurrent", symbol: "equipment", height: 0, box: { w: 600, d: 600, h: 1200 }, wall: true, power: 500 }),
  // ВК
  D({ kind: "riserB1", system: "water", symbol: "riser", height: 0, box: { w: 32, d: 32, h: 0 }, riser: true }),
  D({ kind: "meter", system: "water", symbol: "equipment", height: 500, box: { w: 400, d: 150, h: 200 }, wall: true }),
  D({ kind: "sink", system: "water", symbol: "fixture", height: 850, box: { w: 500, d: 400, h: 150 }, wall: true }),
  D({ kind: "toilet", system: "water", symbol: "fixture", height: 0, box: { w: 380, d: 650, h: 400 }, wall: true }),
  D({ kind: "riserT3", system: "hotwater", symbol: "riser", height: 0, box: { w: 32, d: 32, h: 0 }, riser: true }),
  D({ kind: "heater", system: "hotwater", symbol: "equipment", height: 1200, box: { w: 450, d: 450, h: 800 }, wall: true, power: 2000 }),
  D({ kind: "riserK1", system: "sewer", symbol: "riser", height: 0, box: { w: 110, d: 110, h: 0 }, riser: true }),
  D({ kind: "drain", system: "sewer", symbol: "drain", height: 0, box: { w: 150, d: 150, h: 20 } }),
  D({ kind: "cleanout", system: "sewer", symbol: "detector", height: 1000, box: { w: 110, d: 110, h: 110 }, wall: true }),
  // ОВ
  D({ kind: "radiator", system: "heating", symbol: "radiator", height: 150, box: { w: 1000, d: 100, h: 500 }, wall: true }),
  D({ kind: "riserT1", system: "heating", symbol: "riser", height: 0, box: { w: 32, d: 32, h: 0 }, riser: true }),
  D({ kind: "boiler", system: "heating", symbol: "equipment", height: 800, box: { w: 450, d: 350, h: 750 }, wall: true, power: 24000 }),
  D({ kind: "supply", system: "ventilation", symbol: "diffuser", height: "ceiling", box: { w: 400, d: 400, h: 60 } }),
  D({ kind: "exhaust", system: "ventilation", symbol: "diffuser", height: "ceiling", box: { w: 400, d: 400, h: 60 } }),
  D({ kind: "fan", system: "ventilation", symbol: "equipment", height: "ceiling", box: { w: 400, d: 400, h: 300 }, power: 150 }),
]

export const MEP_DEVICE_BY_KIND: Record<string, MepDeviceInfo> = Object.fromEntries(MEP_DEVICES.map((d) => [d.kind, d]))

export function devicesOf(system: MepSystem): MepDeviceInfo[] {
  return MEP_DEVICES.filter((d) => d.system === system)
}

/**
 * Ключ названия прибора по его kind. В модели kind — обычная строка (её мог
 * записать старый клиент), поэтому неизвестный вид отдаёт «Розетку»: подпись
 * без перевода выглядела бы как техническая метка вроде «socket380».
 */
export function deviceNameKey(kind: string | null | undefined): MepDeviceNameKey {
  return kind && kind in MEP_DEVICE_BY_KIND ? (kind as MepDeviceNameKey) : "socket"
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
