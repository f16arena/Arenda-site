import { describe, expect, it } from "vitest"
import { setColumnSizeCommand } from "./commands"
import type { BuilderDocument, Floor, Stair } from "@/types/builder"

const col = (id: string, width: number, depth?: number): Stair => ({ id, shape: "column", fromFloorId: "f", toFloorId: "f", position: { x: 0, y: 0 }, rotationDeg: 0, width, depth, railing: false })

function doc(stairs: Stair[]): BuilderDocument {
  const floor = { id: "f", stairs } as unknown as Floor
  return { buildings: [{ id: "b", floors: [floor] }] } as unknown as BuilderDocument
}

describe("размер колонн", () => {
  const stairs = [col("a", 600, 580), col("b", 500), { ...col("s", 1100), shape: "u" as const }]
  it("у всех колонн этажа: ширина меняется, глубина остаётся прежней, лестница не трогается", () => {
    const d = doc(stairs)
    const out = setColumnSizeCommand(d.buildings[0].floors[0], "a", { width: 700 }, true).apply(d)
    const s = out.buildings[0].floors[0].stairs
    expect(s.map((x) => [x.width, x.depth])).toEqual([[700, 580], [700, 500], [1100, undefined]])
  })
  it("только у выбранной", () => {
    const d = doc(stairs)
    const out = setColumnSizeCommand(d.buildings[0].floors[0], "a", { depth: 650 }, false).apply(d)
    expect(out.buildings[0].floors[0].stairs.map((x) => x.depth)).toEqual([650, undefined, undefined])
  })
})
