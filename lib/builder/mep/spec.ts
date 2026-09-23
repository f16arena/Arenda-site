// Спецификация сетей этажа: приборы по штукам, трассы по погонным метрам,
// установленная мощность. Тот же расчёт показывает панель «Сети» и лист чертежа.

import type { Floor, MepSystem } from "@/types/builder"
import { MEP_DEVICE_BY_KIND, MEP_SYSTEM_INFO, deviceNameKey, polylineLengthMm } from "./catalog"
import type { SheetT } from "@/lib/builder/sheet-text"

export interface SpecRow {
  system: MepSystem
  /** «Розетка», «Кабель ВВГнг(А)-LS 3×2,5» */
  name: string
  /** штуки или погонные метры; подпись единицы — в adminBuilder.mep.unit* */
  unit: "pcs" | "m"
  qty: number
}

export interface SystemSummary {
  system: MepSystem
  rows: SpecRow[]
  devices: number
  lengthM: number
  powerW: number
}

/** Все опущенные вниз/поднятые вверх участки к приборам сюда не входят — запас на монтаж даёт проектировщик. */
export function mepSpec(floor: Pick<Floor, "mepRuns" | "mepDevices">, t: SheetT): SystemSummary[] {
  const out = new Map<MepSystem, SystemSummary>()
  const get = (s: MepSystem) => {
    let v = out.get(s)
    if (!v) {
      v = { system: s, rows: [], devices: 0, lengthM: 0, powerW: 0 }
      out.set(s, v)
    }
    return v
  }
  const devRows = new Map<string, SpecRow>()
  for (const d of floor.mepDevices ?? []) {
    const info = MEP_DEVICE_BY_KIND[d.kind]
    const sum = get(d.system)
    sum.devices += 1
    sum.powerW += d.power ?? info?.power ?? 0
    const key = `${d.system}|${d.kind}`
    const row = devRows.get(key) ?? { system: d.system, name: t(`adminBuilder.mep.devices.${deviceNameKey(d.kind)}`), unit: "pcs" as const, qty: 0 }
    row.qty += 1
    devRows.set(key, row)
  }
  const runRows = new Map<string, SpecRow>()
  for (const r of floor.mepRuns ?? []) {
    const sum = get(r.system)
    const m = polylineLengthMm(r.points) / 1000
    sum.lengthM += m
    const size = r.size || MEP_SYSTEM_INFO[r.system].size
    const key = `${r.system}|${size}`
    const row = runRows.get(key) ?? { system: r.system, name: `${t(`adminBuilder.mep.runNouns.${MEP_SYSTEM_INFO[r.system].shape}`)} ${size}`, unit: "m" as const, qty: 0 }
    row.qty += m
    runRows.set(key, row)
  }
  for (const row of [...devRows.values(), ...runRows.values()]) get(row.system).rows.push(row)
  const order = Object.keys(MEP_SYSTEM_INFO) as MepSystem[]
  return order.filter((s) => out.has(s)).map((s) => {
    const v = out.get(s) as SystemSummary
    v.rows.sort((a, b) => (a.unit === b.unit ? a.name.localeCompare(b.name) : a.unit === "pcs" ? -1 : 1))
    v.rows = v.rows.map((r) => ({ ...r, qty: r.unit === "m" ? Math.round(r.qty * 10) / 10 : r.qty }))
    v.lengthM = Math.round(v.lengthM * 10) / 10
    return v
  })
}
