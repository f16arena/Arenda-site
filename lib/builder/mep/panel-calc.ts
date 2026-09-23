// Расчётная таблица щита (упрощённо по СП 256.1325800 / ПУЭ): группы
// потребителей, установленная и расчётная мощность, ток, номинал автомата,
// сечение медного кабеля, длина линии и потеря напряжения.
//
// Это инженерная оценка для рабочей стадии, а не замена расчёта в
// специализированной программе: коэффициенты спроса и cos φ — типовые.

import type { Floor, MepDevice, MepSystem } from "@/types/builder"
import { detectRooms } from "@/core/geometry/room-detection"
import { pointInPolygon, type Vec2 } from "@/core/geometry/math"
import { MEP_DEVICE_BY_KIND, MEP_SYSTEM_INFO, polylineLengthMm } from "./catalog"
import type { SheetT } from "@/lib/builder/sheet-text"

export const BREAKERS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125]

/** Длительно допустимый ток медного кабеля в трубе/коробе (ПУЭ табл. 1.3.4, 3 жилы), А → сечение, мм² */
const CABLE: Array<{ s: number; i1: number; i3: number }> = [
  { s: 1.5, i1: 19, i3: 17 },
  { s: 2.5, i1: 25, i3: 25 },
  { s: 4, i1: 35, i3: 30 },
  { s: 6, i1: 42, i3: 40 },
  { s: 10, i1: 55, i3: 50 },
  { s: 16, i1: 75, i3: 70 },
  { s: 25, i1: 95, i3: 85 },
  { s: 35, i1: 120, i3: 100 },
  { s: 50, i1: 145, i3: 135 },
]

const RHO_CU = 0.0175 // Ом·мм²/м

export type GroupKind = "lighting" | "sockets" | "power3" | "equipment"

export interface PanelGroup {
  panelId: string
  group: number
  kind: GroupKind
  /** «Освещение, пом. 101» */
  purpose: string
  deviceIds: string[]
  pInstW: number
  kc: number
  pCalcW: number
  cosPhi: number
  phases: 1 | 3
  currentA: number
  breakerA: number
  cableMm2: number
  cableMark: string
  lengthM: number
  dropPct: number
}

export interface PanelCalc {
  panelId: string
  label: string
  groups: PanelGroup[]
  pInstW: number
  pCalcW: number
  currentA: number
  inputBreakerA: number
}

// title — ключ словаря (adminBuilder.mep.group*): назначение группы попадает
// в расчётную таблицу щита, а её печатают на языке того, кто открыл лист.
const KIND_PARAMS: Record<GroupKind, { kc: number; cos: number; minBreaker: number; minSection: number; title: "groupLighting" | "groupSockets" | "groupPower3" | "groupEquipment" }> = {
  lighting: { kc: 1, cos: 0.95, minBreaker: 10, minSection: 1.5, title: "groupLighting" },
  sockets: { kc: 0.8, cos: 0.9, minBreaker: 16, minSection: 2.5, title: "groupSockets" },
  power3: { kc: 0.9, cos: 0.85, minBreaker: 16, minSection: 2.5, title: "groupPower3" },
  equipment: { kc: 1, cos: 0.85, minBreaker: 16, minSection: 2.5, title: "groupEquipment" },
}

export function groupKindOf(d: Pick<MepDevice, "kind" | "system">): GroupKind | null {
  if (d.kind === "panel" || MEP_DEVICE_BY_KIND[d.kind]?.riser) return null
  if (d.system === "lighting") return "lighting"
  if (d.kind === "socket380") return "power3"
  if (d.kind === "socket" || d.kind === "socket2") return "sockets"
  if (d.system === "power" || d.system === "lowcurrent" || (MEP_DEVICE_BY_KIND[d.kind]?.power ?? 0) > 0) return "equipment"
  return null
}

function devicePower(d: MepDevice): number {
  return d.power ?? MEP_DEVICE_BY_KIND[d.kind]?.power ?? 0
}

function pickBreaker(i: number, min: number): number {
  return BREAKERS.find((b) => b >= Math.max(min, i * 1.1)) ?? BREAKERS[BREAKERS.length - 1]
}

function pickCable(breaker: number, phases: 1 | 3, min: number): number {
  const row = CABLE.find((c) => c.s >= min && (phases === 1 ? c.i1 : c.i3) >= breaker)
  return row ? row.s : CABLE[CABLE.length - 1].s
}

function fmtSection(s: number): string {
  return String(s).replace(".", ",")
}

/**
 * Длина линии: трассы группы по обозначению («гр.3», по-казахски «тп. 3»),
 * иначе — ломаная щит → приборы по осям с запасом 1,2.
 */
function groupLength(floor: Floor, panel: MepDevice, devices: MepDevice[], group: number): number {
  const tag = new RegExp(`(?:гр|тп)\\.?\\s*${group}(?!\\d)`, "i")
  const runs = (floor.mepRuns ?? []).filter((r) => (r.system === "power" || r.system === "lighting") && tag.test(r.label))
  if (runs.length) return runs.reduce((s, r) => s + polylineLengthMm(r.points), 0) / 1000
  let L = 0
  let cur: Vec2 = panel.at
  const rest = [...devices]
  while (rest.length) {
    rest.sort((a, b) => Math.abs(a.at.x - cur.x) + Math.abs(a.at.y - cur.y) - (Math.abs(b.at.x - cur.x) + Math.abs(b.at.y - cur.y)))
    const next = rest.shift() as MepDevice
    L += Math.abs(next.at.x - cur.x) + Math.abs(next.at.y - cur.y)
    cur = next.at
  }
  // подъёмы/опуски к приборам и запас на разделку
  return (L * 1.2) / 1000 + devices.length * 2
}

function roomLabelOf(floor: Floor, at: Vec2, numberOf: (roomId: string) => string | null): string | null {
  for (const r of detectRooms(floor.wallGraph)) if (pointInPolygon(at, r.polygon)) return numberOf(r.id)
  return null
}

export function calcPanels(floor: Floor, t: SheetT, numberOf: (roomId: string) => string | null = () => null): PanelCalc[] {
  const devices = floor.mepDevices ?? []
  const panels = devices.filter((d) => d.kind === "panel")
  return panels.map((panel) => {
    const mine = devices.filter((d) => d.panelId === panel.id && d.group && groupKindOf(d))
    const byGroup = new Map<number, MepDevice[]>()
    for (const d of mine) byGroup.set(d.group as number, [...(byGroup.get(d.group as number) ?? []), d])
    const groups: PanelGroup[] = [...byGroup.entries()].sort((a, b) => a[0] - b[0]).map(([group, list]) => {
      const kinds = list.map((d) => groupKindOf(d) as GroupKind)
      const kind: GroupKind = kinds.includes("power3") ? "power3" : kinds.every((k) => k === "lighting") ? "lighting" : kinds.includes("sockets") ? "sockets" : "equipment"
      const p = KIND_PARAMS[kind]
      const phases: 1 | 3 = kind === "power3" ? 3 : 1
      const pInst = list.reduce((s, d) => s + devicePower(d), 0)
      const pCalc = pInst * p.kc
      const current = phases === 1 ? pCalc / (230 * p.cos) : pCalc / (Math.sqrt(3) * 400 * p.cos)
      const breaker = pickBreaker(current, p.minBreaker)
      const cable = pickCable(breaker, phases, p.minSection)
      const lengthM = groupLength(floor, panel, list, group)
      // потеря напряжения: 1ф — 2·L·I·ρ/(S·U), 3ф — √3·L·I·ρ·cosφ/(S·U)
      const drop = phases === 1 ? ((2 * lengthM * current * RHO_CU) / (cable * 230)) * 100 : ((Math.sqrt(3) * lengthM * current * RHO_CU * p.cos) / (cable * 400)) * 100
      const rooms = [...new Set(list.map((d) => roomLabelOf(floor, d.at, numberOf)).filter(Boolean))] as string[]
      return {
        panelId: panel.id,
        group,
        kind,
        purpose: rooms.length
          ? t("adminBuilder.mep.purposeRooms", { title: t(`adminBuilder.mep.${p.title}`), rooms: `${rooms.slice(0, 3).join(", ")}${rooms.length > 3 ? "…" : ""}` })
          : t(`adminBuilder.mep.${p.title}`),
        deviceIds: list.map((d) => d.id),
        pInstW: Math.round(pInst),
        kc: p.kc,
        pCalcW: Math.round(pCalc),
        cosPhi: p.cos,
        phases,
        currentA: Math.round(current * 10) / 10,
        breakerA: breaker,
        cableMm2: cable,
        cableMark: `ВВГнг(А)-LS ${phases === 3 ? 5 : 3}×${fmtSection(cable)}`,
        lengthM: Math.round(lengthM * 10) / 10,
        dropPct: Math.round(drop * 100) / 100,
      }
    })
    const pInst = groups.reduce((s, g) => s + g.pInstW, 0)
    // щит: коэффициент одновременности 0,8 при трёх и более группах
    const pCalc = groups.reduce((s, g) => s + g.pCalcW, 0) * (groups.length >= 3 ? 0.8 : 1)
    const current = pCalc / (Math.sqrt(3) * 400 * 0.9)
    return {
      panelId: panel.id,
      label: panel.label || t("adminBuilder.props.mepPanelDefault"),
      groups,
      pInstW: Math.round(pInst),
      pCalcW: Math.round(pCalc),
      currentA: Math.round(current * 10) / 10,
      inputBreakerA: pickBreaker(current, 16),
    }
  })
}

/**
 * Разбивка по группам: каждый прибор — к ближайшему щиту; освещение — группа
 * на помещение, розетки — на помещение, не больше 6 розеток (ограничение
 * нагрузки на линию 16 А), силовые 380 В и оборудование — отдельной группой.
 */
export function autoAssignGroups(floor: Floor): Array<{ deviceId: string; panelId: string; group: number }> {
  const devices = floor.mepDevices ?? []
  const panels = devices.filter((d) => d.kind === "panel")
  if (!panels.length) return []
  const rooms = detectRooms(floor.wallGraph)
  const roomOf = (at: Vec2) => rooms.find((r) => pointInPolygon(at, r.polygon))?.id ?? "outside"
  const out: Array<{ deviceId: string; panelId: string; group: number }> = []
  for (const panel of panels) {
    const mine = devices.filter((d) => {
      if (!groupKindOf(d)) return false
      const nearest = panels.reduce((best, p) => (Math.hypot(p.at.x - d.at.x, p.at.y - d.at.y) < Math.hypot(best.at.x - d.at.x, best.at.y - d.at.y) ? p : best))
      return nearest.id === panel.id
    })
    let group = 0
    const buckets = new Map<string, MepDevice[]>()
    for (const d of mine) {
      const kind = groupKindOf(d) as GroupKind
      const key = kind === "power3" || kind === "equipment" ? `${kind}|${d.id}` : `${kind}|${roomOf(d.at)}`
      buckets.set(key, [...(buckets.get(key) ?? []), d])
    }
    const order: GroupKind[] = ["lighting", "sockets", "power3", "equipment"]
    const keys = [...buckets.keys()].sort((a, b) => order.indexOf(a.split("|")[0] as GroupKind) - order.indexOf(b.split("|")[0] as GroupKind) || a.localeCompare(b))
    for (const key of keys) {
      const list = buckets.get(key) as MepDevice[]
      const chunk = key.startsWith("sockets") ? 6 : list.length
      for (let i = 0; i < list.length; i += chunk) {
        group += 1
        for (const d of list.slice(i, i + chunk)) out.push({ deviceId: d.id, panelId: panel.id, group })
      }
    }
  }
  return out
}

export function systemsOfPanel(): MepSystem[] {
  return (Object.keys(MEP_SYSTEM_INFO) as MepSystem[]).filter((s) => s === "power" || s === "lighting")
}
