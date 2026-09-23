import { describe, expect, it } from "vitest"
import { emptyGraph, insertWall } from "@/core/geometry/wall-graph"
import { floorRooms } from "./rooms"
import { autoRoomUse, roomDisplayName, roomUse } from "./room-use"
import { roomExplication } from "./drawing/schedules"
import type { Floor, Stair } from "@/types/builder"

// два помещения 5×4 м: левое с лестницей, правое — офис
function floor(extra: Partial<Floor> = {}): Floor {
  let g = emptyGraph()
  const def = { thickness: 200, height: 3000, kind: "interior" as const }
  const w = (a: [number, number], b: [number, number]) => { g = insertWall(g, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }, def).graph }
  w([0, 0], [10000, 0]); w([10000, 0], [10000, 4000]); w([10000, 4000], [0, 4000]); w([0, 4000], [0, 0]); w([5000, 0], [5000, 4000])
  const stair: Stair = { id: "s1", shape: "straight", fromFloorId: "f", toFloorId: "f2", position: { x: 1500, y: 500 }, rotationDeg: 0, width: 1100, railing: true }
  return { id: "f", name: "3", level: 3, elevation: 0, height: 3000, visible: true, locked: false, opacity: 1, wallGraph: g, openings: [], stairs: [stair], objects: [], premiseLinks: {}, roomMaterials: {}, mepRuns: [], mepDevices: [], ...extra } as Floor
}

describe("назначение помещений", () => {
  it("помещение с лестницей — МОП «Лестничная клетка», офис — аренда", () => {
    const f = floor()
    const [a, b] = floorRooms(f).sort((p, q) => p.polygon[0].x - q.polygon[0].x)
    const withStair = [a, b].find((r) => autoRoomUse(f, r).name)!
    const office = [a, b].find((r) => r !== withStair)!
    expect(roomUse(f, withStair)).toBe("common")
    expect(roomDisplayName(f, withStair)).toBe("stairwell")
    expect(roomDisplayName(f, withStair, (key) => (key === "stairwell" ? "Лестничная клетка" : key))).toBe("Лестничная клетка")
    expect(roomUse(f, office)).toBe("rent")
  })
  it("МОП без номера и не сдвигает нумерацию; ручная отметка важнее авто", () => {
    const f = floor()
    const rows = roomExplication(f)
    expect(rows.filter((r) => r.use === "rent").map((r) => r.number)).toEqual(["301"])
    expect(rows.find((r) => r.use === "common")?.number).toBe("")
    const office = rows.find((r) => r.use === "rent")!
    const f2 = { ...f, roomUse: { [office.roomId]: "tech" as const } }
    expect(roomExplication(f2).every((r) => r.use !== "rent")).toBe(true)
  })
  it("по наименованию: коридор — МОП, электрощитовая — техническое", () => {
    const f = floor({ stairs: [] })
    const [a, b] = floorRooms(f)
    const g = { ...f, roomNames: { [a.id]: "Коридор", [b.id]: "Электрощитовая" } }
    expect(roomUse(g, a)).toBe("common")
    expect(roomUse(g, b)).toBe("tech")
  })
})
