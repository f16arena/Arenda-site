import { describe, it, expect } from "vitest"
import { generateRoof, type RoofType } from "./roof-generator"

// Каждая грань крыши должна смотреть наружу. Иначе в 3D ближний скат
// отсекается, а дальний виден изнанкой — сквозь крышу видно этаж. Лицевая
// сторона считается так же, как у Babylon: нормаль = (c − a) × (b − a).
const TYPES: RoofType[] = ["flat", "gable", "hip", "fourslope", "shed", "mansard"]
const WIDE = [{ x: 0, y: 0 }, { x: 30000, y: 0 }, { x: 30000, y: 20000 }, { x: 0, y: 20000 }]
const DEEP = [{ x: 0, y: 0 }, { x: 20000, y: 0 }, { x: 20000, y: 30000 }, { x: 0, y: 30000 }]

function inwardFaces(positions: number[], indices: number[]): number {
  const n = positions.length / 3
  const c = [0, 0, 0]
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += positions[i * 3 + k] / n
  let bad = 0
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, d] = [indices[i], indices[i + 1], indices[i + 2]].map((v) => positions.slice(v * 3, v * 3 + 3))
    const u = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]
    const w = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const nx = u[1] * w[2] - u[2] * w[1]
    const ny = u[2] * w[0] - u[0] * w[2]
    const nz = u[0] * w[1] - u[1] * w[0]
    const m = [(a[0] + b[0] + d[0]) / 3 - c[0], (a[1] + b[1] + d[1]) / 3 - c[1], (a[2] + b[2] + d[2]) / 3 - c[2]]
    if (nx * m[0] + ny * m[1] + nz * m[2] <= 0) bad++
  }
  return bad
}

describe("грани крыши смотрят наружу", () => {
  for (const type of TYPES) {
    for (const [name, fp] of [["вширь", WIDE], ["вглубь", DEEP], ["вширь, контур по часовой", [...WIDE].reverse()]] as const) {
      it(`${type}, здание вытянуто ${name}`, () => {
        const r = generateRoof(fp, 9000, { type, pitchDeg: 28, overhang: 300, thickness: 200 })
        expect(r.indices.length).toBeGreaterThan(0)
        expect(inwardFaces(r.positions, r.indices)).toBe(0)
      })
    }
  }
})
