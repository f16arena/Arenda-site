import { describe, expect, it } from "vitest"
import { emptyGraph, insertWall } from "@/core/geometry/wall-graph"
import { buildDemoProject } from "@/lib/builder/demo-project"
import { findFloor, replanDeleteWall, SetWallPhaseCommand } from "@/core/document/commands"
import { floorAtStage, hasReplan, phaseGraph, replanSummary } from "./replan"
import { buildFloorDrawing } from "./drawing/floor-drawing"
import type { Floor } from "@/types/builder"

function twoRooms(): Floor {
  let g = emptyGraph()
  const ext = { thickness: 300, height: 3000, kind: "exterior" as const }
  const pts = [[0, 0], [10000, 0], [10000, 5000], [0, 5000], [0, 0]]
  for (let i = 0; i < 4; i++) g = insertWall(g, { x: pts[i][0], y: pts[i][1] }, { x: pts[i + 1][0], y: pts[i + 1][1] }, ext).graph
  // старая перегородка посередине — под снос; новая — ближе к краю
  g = insertWall(g, { x: 5000, y: 0 }, { x: 5000, y: 5000 }, { thickness: 120, height: 3000, kind: "partition", phase: "demolish" }).graph
  g = insertWall(g, { x: 7000, y: 0 }, { x: 7000, y: 5000 }, { thickness: 120, height: 3000, kind: "partition", phase: "new" }).graph
  const oldWall = Object.values(g.edges).find((e) => e.phase === "demolish")!
  return {
    id: "f", name: "1", level: 1, elevation: 0, height: 3000, visible: true, locked: false, opacity: 1, wallGraph: g,
    openings: [{ id: "o1", wallId: oldWall.id, type: "door", variant: "interior", width: 900, height: 2100, sillHeight: 0, offset: 2500 }],
    stairs: [], objects: [], premiseLinks: {}, roomMaterials: {}, mepRuns: [], mepDevices: [],
  }
}

describe("перепланировка", () => {
  it("метка переходит на части разрезанной стены", () => {
    const f = twoRooms()
    // наружные стены разбиты примыканиями, но новые/демонтажные участки сохранили метки
    expect(Object.values(f.wallGraph.edges).filter((e) => e.phase === "demolish").length).toBeGreaterThanOrEqual(1)
    expect(Object.values(f.wallGraph.edges).filter((e) => e.kind === "exterior").every((e) => !e.phase)).toBe(true)
    expect(hasReplan(f)).toBe(true)
  })

  it("было и стало: разные стены, проём снесённой стены пропадает", () => {
    const f = twoRooms()
    const before = floorAtStage(f, "before"), after = floorAtStage(f, "after")
    expect(Object.values(before.wallGraph.edges).some((e) => e.phase === "new")).toBe(false)
    expect(Object.values(after.wallGraph.edges).some((e) => e.phase === "demolish")).toBe(false)
    expect(before.openings).toHaveLength(1)
    expect(after.openings).toHaveLength(0)
    expect(Object.keys(phaseGraph(f.wallGraph, "after").edges).length).toBeLessThan(Object.keys(f.wallGraph.edges).length)
  })

  it("сравнение площадей: две комнаты 5×5 стали 7×5 и 3×5", () => {
    const s = replanSummary(twoRooms())
    expect(s.demolishWallM).toBe(5)
    expect(s.newWallM).toBe(5)
    // каждое новое помещение сопоставлено со старым, в котором лежит его центр
    expect(s.rooms.map((r) => [r.before, r.after]).sort()).toEqual([[25, 15], [25, 35]])
    expect(s.areaBefore).toBe(s.areaAfter)
  })

  it("лист демонтажа: снесённая стена пунктиром, лист монтажа — штриховка новой", () => {
    const f = twoRooms()
    expect(buildFloorDrawing(f, undefined, "demolish").wallStyles).toContain("demolish")
    expect(buildFloorDrawing(f, undefined, "install").wallStyles).toContain("new")
    const plan = buildFloorDrawing(f)
    expect(plan.wallStyles.every((x) => x === "solid")).toBe(true)
    expect(plan.rooms).toHaveLength(2)
    expect(buildFloorDrawing(f, undefined, "after").rooms).toHaveLength(2)
  })

  it("удаление в режиме перепланировки помечает, повторно не удаляет, откатывается", () => {
    const doc = buildDemoProject()
    const floor = doc.buildings[0].floors[0]
    const edgeId = Object.keys(floor.wallGraph.edges)[0]
    const cmd = replanDeleteWall(doc, floor.id, edgeId, true)!
    expect(cmd).toBeInstanceOf(SetWallPhaseCommand)
    const d1 = cmd.apply(doc)
    expect(findFloor(d1, floor.id)?.wallGraph.edges[edgeId].phase).toBe("demolish")
    expect(replanDeleteWall(d1, floor.id, edgeId, true)).toBeNull()
    expect(findFloor(cmd.revert(d1), floor.id)?.wallGraph.edges[edgeId].phase).toBeUndefined()
    // без режима — обычное удаление
    expect(replanDeleteWall(doc, floor.id, edgeId, false)?.kind).toBe("delete-wall")
  })
})
