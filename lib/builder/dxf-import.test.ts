import { describe, expect, it } from "vitest"
import { parseDxf } from "./dxf-import"
import { buildFloorDrawing } from "./drawing/floor-drawing"
import { floorDrawingToDxf } from "./drawing/dxf"
import { buildDemoProject } from "./demo-project"

const dxf = (header: string, blocks: string, ents: string) =>
  ["0", "SECTION", "2", "HEADER", header, "0", "ENDSEC", "0", "SECTION", "2", "BLOCKS", blocks, "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", ents, "0", "ENDSEC", "0", "EOF"].filter(Boolean).join("\n")

describe("импорт DXF", () => {
  it("свой экспорт читается обратно в тех же миллиметрах", () => {
    const floor = buildDemoProject().buildings[0].floors[0]
    const d = buildFloorDrawing(floor)
    const back = parseDxf(floorDrawingToDxf(d, 100, "План"))
    expect(back.unitToMm).toBe(1)
    expect(back.layers).toContain("A-WALL")
    expect(back.segments.length).toBeGreaterThan(20)
    // габарит стен попадает внутрь импортированного (там ещё размеры и оси)
    expect(back.bounds.minX).toBeLessThanOrEqual(d.bounds.minX + 1)
    expect(back.bounds.maxX).toBeGreaterThanOrEqual(d.bounds.maxX - 1)
  })

  it("метры, замкнутая полилиния с дугой, блок с поворотом", () => {
    const text = dxf(
      "9\n$INSUNITS\n70\n6",
      "0\nBLOCK\n8\n0\n2\nDOOR\n10\n0\n20\n0\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n1\n21\n0\n0\nENDBLK\n8\n0",
      [
        "0\nLWPOLYLINE\n8\nWALLS\n90\n4\n70\n1\n10\n0\n20\n0\n10\n10\n20\n0\n42\n1\n10\n10\n20\n6\n10\n0\n20\n6",
        "0\nINSERT\n8\nDOORS\n2\nDOOR\n10\n5\n20\n5\n50\n90",
      ].join("\n"),
    )
    const r = parseDxf(text)
    expect(r.unitToMm).toBe(1000)
    expect(r.layers).toEqual(["DOORS", "WALLS"])
    // дуга-полуокружность между (10,0) и (10,6) выпирает на 3 м вправо
    expect(r.bounds.maxX).toBeCloseTo(13000, -1)
    // блок повёрнут на 90°: отрезок (5,5)→(5,6)
    const door = r.segments.find((s) => Math.abs(s[0] - 5000) < 1 && Math.abs(s[1] - 5000) < 1)
    expect(door?.[2]).toBeCloseTo(5000)
    expect(door?.[3]).toBeCloseTo(6000)
  })

  it("пустой файл — понятная ошибка", () => {
    expect(() => parseDxf(dxf("", "", ""))).toThrow(/нет линий/)
  })
})
