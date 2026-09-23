import { describe, expect, it } from "vitest"
import { emptyGraph, insertWall } from "@/core/geometry/wall-graph"
import type { Floor, MepDevice } from "@/types/builder"
import { autoAssignGroups, calcPanels } from "./panel-calc"

import { createTranslator } from "@/lib/i18n/translate"
import { ru } from "@/lib/i18n/messages"

// Тексты на листах собираются переводчиком — в тестах берём русский словарь.
const { t } = createTranslator("ru", ru)

function floorWith(devices: MepDevice[]): Floor {
  let g = emptyGraph()
  const pts = [[0, 0], [12000, 0], [12000, 6000], [0, 6000], [0, 0]]
  for (let i = 0; i < 4; i++) g = insertWall(g, { x: pts[i][0], y: pts[i][1] }, { x: pts[i + 1][0], y: pts[i + 1][1] }, { thickness: 300, height: 3000, kind: "exterior" }).graph
  g = insertWall(g, { x: 6000, y: 0 }, { x: 6000, y: 6000 }, { thickness: 120, height: 3000, kind: "partition" }).graph
  return {
    id: "f", name: "1", level: 1, elevation: 0, height: 3000, visible: true, locked: false, opacity: 1, wallGraph: g,
    openings: [], stairs: [], objects: [], premiseLinks: {}, roomMaterials: {}, mepRuns: [], mepDevices: devices,
  }
}

const dev = (id: string, system: MepDevice["system"], kind: string, x: number, y: number, power?: number): MepDevice =>
  ({ id, system, kind, at: { x, y }, height: 300, rotation: 0, label: kind === "panel" ? "ЩР-1" : "", power })

function sample(): Floor {
  const d: MepDevice[] = [dev("p", "power", "panel", 200, 3000)]
  for (let i = 0; i < 8; i++) d.push(dev(`s${i}`, "power", "socket", 1000 + i * 600, 5800, 300)) // 8 розеток в левой комнате
  d.push(dev("l1", "lighting", "lamp", 3000, 3000, 36), dev("l2", "lighting", "lamp", 9000, 3000, 36))
  d.push(dev("k", "power", "socket380", 11000, 500, 7500))
  return floorWith(d)
}

describe("расчёт щита", () => {
  it("разбивка: свет по помещениям, розетки не больше 6 в группе, 380 В отдельно", () => {
    const f = sample()
    const a = autoAssignGroups(f)
    const groupOf = (id: string) => a.find((x) => x.deviceId === id)?.group
    expect(groupOf("l1")).not.toBe(groupOf("l2")) // разные помещения
    const socketGroups = new Set(["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"].map(groupOf))
    expect(socketGroups.size).toBe(2) // 8 розеток → 6 + 2
    expect(a.filter((x) => x.group === groupOf("k"))).toHaveLength(1)
    expect(a.every((x) => x.panelId === "p")).toBe(true)
  })

  it("ток, автомат, сечение и потеря напряжения по группам", () => {
    const f = sample()
    const a = autoAssignGroups(f)
    const assigned = { ...f, mepDevices: f.mepDevices.map((d) => { const x = a.find((y) => y.deviceId === d.id); return x ? { ...d, panelId: x.panelId, group: x.group } : d }) }
    const [panel] = calcPanels(assigned, t)
    expect(panel.label).toBe("ЩР-1")
    const sockets6 = panel.groups.find((g) => g.kind === "sockets" && g.deviceIds.length === 6)!
    // 1800 Вт × 0,8 / (230 × 0,9) ≈ 6,96 А → автомат 16 А (минимум для розеток), кабель 3×2,5
    expect(sockets6.currentA).toBeCloseTo(7, 0)
    expect(sockets6.breakerA).toBe(16)
    expect(sockets6.cableMark).toBe("ВВГнг(А)-LS 3×2,5")
    const light = panel.groups.find((g) => g.kind === "lighting")!
    expect(light.breakerA).toBe(10)
    expect(light.cableMm2).toBe(1.5)
    const p3 = panel.groups.find((g) => g.kind === "power3")!
    // 7500 × 0,9 / (√3 × 400 × 0,85) ≈ 11,5 А → 16 А, 5×2,5
    expect(p3.phases).toBe(3)
    expect(p3.currentA).toBeCloseTo(11.5, 0)
    expect(p3.cableMark).toBe("ВВГнг(А)-LS 5×2,5")
    expect(panel.groups.every((g) => g.lengthM > 0 && g.dropPct > 0 && g.dropPct < 4)).toBe(true)
    expect(panel.pInstW).toBe(8 * 300 + 72 + 7500)
    expect(panel.inputBreakerA).toBeGreaterThanOrEqual(16)
  })

  it("длина по трассе группы, если трасса подписана «гр.N»", () => {
    const f = sample()
    const a = autoAssignGroups(f)
    const light = a.find((x) => x.deviceId === "l1")!
    const withRun: Floor = {
      ...f,
      mepDevices: f.mepDevices.map((d) => { const x = a.find((y) => y.deviceId === d.id); return x ? { ...d, panelId: x.panelId, group: x.group } : d }),
      mepRuns: [{ id: "r", system: "lighting", points: [{ x: 200, y: 3000 }, { x: 25200, y: 3000 }], height: 2900, size: "", label: `гр.${light.group}` }],
    }
    const g = calcPanels(withRun, t)[0].groups.find((x) => x.group === light.group)!
    expect(g.lengthM).toBe(25)
  })
})
