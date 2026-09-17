import { describe, expect, it } from "vitest"
import { emptyGraph, insertWall } from "@/core/geometry/wall-graph"
import type { Floor } from "@/types/builder"
import { openingName, openingSchedule, roomExplication } from "./schedules"
import { buildFloorDrawing } from "./floor-drawing"

function floor(id: string, level: number): Floor {
  let g = emptyGraph()
  const pts = [[0, 0], [10000, 0], [10000, 6000], [0, 6000], [0, 0]]
  for (let i = 0; i < 4; i++) g = insertWall(g, { x: pts[i][0], y: pts[i][1] }, { x: pts[i + 1][0], y: pts[i + 1][1] }, { thickness: 400, height: 3000, kind: "exterior" }).graph
  g = insertWall(g, { x: 4000, y: 0 }, { x: 4000, y: 6000 }, { thickness: 120, height: 3000, kind: "partition" }).graph
  const walls = Object.values(g.edges)
  const ext = walls.filter((e) => e.kind === "exterior")
  const part = walls.find((e) => e.kind === "partition")!
  return {
    id, name: id, level, elevation: level * 3000, height: 3000, visible: true, locked: false, opacity: 1, wallGraph: g,
    openings: [
      { id: `${id}w1`, wallId: ext[0].id, type: "window", variant: "standard", width: 1500, height: 1500, sillHeight: 900, offset: 1500 },
      { id: `${id}w2`, wallId: ext[1].id, type: "window", variant: "standard", width: 1503, height: 1500, sillHeight: 900, offset: 1500 },
      { id: `${id}w3`, wallId: ext[2].id, type: "window", variant: "standard", width: 900, height: 1500, sillHeight: 900, offset: 1000 },
      { id: `${id}d1`, wallId: part.id, type: "door", variant: "interior", width: 900, height: 2100, sillHeight: 0, offset: 3000 },
      { id: `${id}x`, wallId: part.id, type: "door", variant: "interior", width: 800, height: 2100, sillHeight: 0, offset: 1000, phase: "demolish" },
    ],
    stairs: [], objects: [], premiseLinks: {}, roomMaterials: {}, mepRuns: [], mepDevices: [],
  }
}

describe("ведомости АР", () => {
  it("марки по зданию: одинаковые размеры — одна марка, окна по возрастанию ширины", () => {
    const s = openingSchedule([floor("f1", 1), floor("f2", 2)])
    expect(s.rows.map((r) => [r.mark, r.width, r.total])).toEqual([["ОК-1", 900, 2], ["ОК-2", 1500, 4], ["Д-1", 900, 2]])
    expect(s.marks.get("f1w2")).toBe("ОК-2") // 1503 округлилось к 1500
    expect(s.marks.has("f1x")).toBe(false) // демонтируемый проём не в ведомости
    expect(s.rows[1].perFloor).toEqual({ f1: 2, f2: 2 })
    expect(openingName(s.rows[2])).toBe("Дверь внутренняя 900×2100")
  })

  it("экспликация: номера по этажу, наименования, площади", () => {
    const f = floor("f1", 1)
    const rooms = roomExplication({ ...f, roomNames: {} })
    expect(rooms.map((r) => r.number)).toEqual(["101", "102"])
    const withName = roomExplication({ ...f, roomNames: { [rooms[0].roomId]: "Офис" } })
    expect(withName[0].name).toBe("Офис")
    expect(rooms.reduce((s, r) => s + r.areaM2, 0)).toBeGreaterThan(50)
    expect(roomExplication({ ...f, level: 0 })[0].number).toBe("001")
  })

  it("марки ставятся на план у проёмов", () => {
    const f = floor("f1", 1)
    const s = openingSchedule([f])
    const d = buildFloorDrawing(f, undefined, "plan", { openingMarks: s.marks })
    expect(d.marks.map((m) => m.text).sort()).toEqual(["Д-1", "ОК-1", "ОК-2", "ОК-2"])
  })
})
