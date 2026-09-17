// Сети на листе: трассы с марками (В1, Т3, К1…), приборы условными знаками,
// таблица условных обозначений и спецификация. Чистая функция: этаж + раздел →
// примитивы в мм модели. Лист SVG и DXF строятся из одного набора.

import type { Floor, MepSystem } from "@/types/builder"
import { MEP_DEVICE_BY_KIND, MEP_SYSTEM_INFO, type MepSection, type MepSymbol } from "@/lib/builder/mep/catalog"
import { mepSpec, type SystemSummary } from "@/lib/builder/mep/spec"
import type { Pt } from "./floor-drawing"

/** Раздел листа: архитектура (обмерный план), один инженерный раздел или все сети. */
export type SheetSection = "ar" | "mep" | MepSection

export const SECTION_TITLE: Record<SheetSection, string> = {
  ar: "Обмерный план",
  mep: "Инженерные сети",
  ЭМ: "Силовое электрооборудование",
  ЭО: "Электроосвещение",
  СС: "Сети связи и слаботочные системы",
  ВК: "Водопровод и канализация",
  ОВ: "Отопление и вентиляция",
}

export function sectionSystems(section: SheetSection): MepSystem[] {
  if (section === "ar") return []
  const all = Object.values(MEP_SYSTEM_INFO)
  return (section === "mep" ? all : all.filter((s) => s.section === section)).map((s) => s.id)
}

export interface MepRunShape {
  system: MepSystem
  points: Pt[]
  /** марка сети посередине самого длинного участка */
  tag: string
  tagAt: Pt
  /** угол участка с маркой, градусы (текст вдоль трассы) */
  tagAngle: number
}

export interface MepDeviceShape {
  system: MepSystem
  kind: string
  symbol: MepSymbol
  at: Pt
  rotation: number
  label: string
  /** вдоль стены, мм модели (для радиатора — настоящая длина) */
  widthMm: number
}

export interface LegendRow {
  system: MepSystem
  symbol: MepSymbol | "line"
  text: string
}

export interface MepDrawing {
  runs: MepRunShape[]
  devices: MepDeviceShape[]
  legend: LegendRow[]
  spec: SystemSummary[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null
}

export function buildMepDrawing(floor: Pick<Floor, "mepRuns" | "mepDevices">, section: SheetSection): MepDrawing {
  const systems = new Set(sectionSystems(section))
  const runs: MepRunShape[] = []
  const devices: MepDeviceShape[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const grow = (p: Pt) => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }

  for (const r of floor.mepRuns ?? []) {
    if (!systems.has(r.system) || r.points.length < 2) continue
    let best = 1, bestLen = -1
    for (let i = 1; i < r.points.length; i++) {
      const L = Math.hypot(r.points[i].x - r.points[i - 1].x, r.points[i].y - r.points[i - 1].y)
      if (L > bestLen) { bestLen = L; best = i }
    }
    const a = r.points[best - 1], b = r.points[best]
    let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
    // текст читается слева направо или снизу вверх
    if (angle > 90) angle -= 180
    if (angle <= -90) angle += 180
    const info = MEP_SYSTEM_INFO[r.system]
    runs.push({
      system: r.system,
      points: r.points.map((p) => ({ ...p })),
      tag: r.label ? `${info.mark} ${r.label}` : info.mark,
      tagAt: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      tagAngle: Math.round(angle * 10) / 10,
    })
    r.points.forEach(grow)
  }

  for (const d of floor.mepDevices ?? []) {
    if (!systems.has(d.system)) continue
    const info = MEP_DEVICE_BY_KIND[d.kind]
    devices.push({
      system: d.system,
      kind: d.kind,
      symbol: info?.symbol ?? "equipment",
      at: { ...d.at },
      rotation: d.rotation,
      label: d.label,
      widthMm: info?.box.w ?? 300,
    })
    grow(d.at)
  }

  // условные обозначения: линия каждой системы и знак каждого вида прибора — только то, что есть на листе
  const legend: LegendRow[] = []
  const seenSys = new Set<MepSystem>()
  for (const r of runs) {
    if (seenSys.has(r.system)) continue
    seenSys.add(r.system)
    const info = MEP_SYSTEM_INFO[r.system]
    legend.push({ system: r.system, symbol: "line", text: `${info.mark} — ${info.name.toLowerCase()}` })
  }
  const seenKind = new Set<string>()
  for (const d of devices) {
    if (seenKind.has(d.kind)) continue
    seenKind.add(d.kind)
    legend.push({ system: d.system, symbol: d.symbol, text: MEP_DEVICE_BY_KIND[d.kind]?.name ?? d.kind })
  }

  const filtered = {
    mepRuns: (floor.mepRuns ?? []).filter((r) => systems.has(r.system)),
    mepDevices: (floor.mepDevices ?? []).filter((d) => systems.has(d.system)),
  }
  return {
    runs,
    devices,
    legend,
    spec: mepSpec(filtered),
    bounds: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null,
  }
}

/** Разделы, в которых на этаже что-то есть — для переключателя листа. */
export function sectionsWithContent(floor: Pick<Floor, "mepRuns" | "mepDevices">): MepSection[] {
  const set = new Set<MepSection>()
  for (const r of floor.mepRuns ?? []) set.add(MEP_SYSTEM_INFO[r.system].section)
  for (const d of floor.mepDevices ?? []) set.add(MEP_SYSTEM_INFO[d.system].section)
  return (["ЭМ", "ЭО", "СС", "ВК", "ОВ"] as MepSection[]).filter((s) => set.has(s))
}
