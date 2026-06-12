// ADR: Параметрические лестницы (§4.3.7). Автоподбор числа ступеней из высоты этажа
// (подступёнок ~170, проступь ~280 мм). Формы: прямая / Г / П / винтовая. Возвращает
// локальные коробки ступеней (+ опц. перила) и прямоугольник выреза в перекрытии выше.
// Координаты локальные [x,y,z] мм относительно position лестницы; поворот — в билдере.

export type StairShape = "straight" | "l" | "u" | "spiral"

export interface StepBox {
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
}

export interface StairGeometry {
  steps: StepBox[]
  rails: StepBox[]
  hole: { minX: number; minZ: number; maxX: number; maxZ: number } // вырез в перекрытии выше, мм (локально)
}

const RISER = 170
const TREAD = 280
const STEP_T = 60

export function generateStair(shape: StairShape, totalRise: number, width: number, railing: boolean): StairGeometry {
  const count = Math.max(2, Math.round(totalRise / RISER))
  const riser = totalRise / count
  const steps: StepBox[] = []
  const rails: StepBox[] = []
  let minX = 0
  let minZ = 0
  let maxX = width
  let maxZ = 0

  const addRun = (n: number, ox: number, oz: number, dir: 1 | -1, axis: "z" | "x", startStep: number) => {
    for (let i = 0; i < n; i++) {
      const idx = startStep + i
      const y = (idx + 1) * riser - STEP_T / 2
      if (axis === "z") {
        const z = oz + dir * (i * TREAD + TREAD / 2)
        steps.push({ x: ox, y, z, w: width, h: STEP_T, d: TREAD })
        minZ = Math.min(minZ, z - TREAD / 2)
        maxZ = Math.max(maxZ, z + TREAD / 2)
        minX = Math.min(minX, ox - width / 2)
        maxX = Math.max(maxX, ox + width / 2)
      } else {
        const x = ox + dir * (i * TREAD + TREAD / 2)
        steps.push({ x, y, z: oz, w: TREAD, h: STEP_T, d: width })
        minX = Math.min(minX, x - TREAD / 2)
        maxX = Math.max(maxX, x + TREAD / 2)
        minZ = Math.min(minZ, oz - width / 2)
        maxZ = Math.max(maxZ, oz + width / 2)
      }
    }
  }

  if (shape === "straight" || shape === "spiral") {
    addRun(count, width / 2, 0, 1, "z", 0)
  } else if (shape === "l") {
    const n1 = Math.ceil(count / 2)
    const n2 = count - n1
    addRun(n1, width / 2, 0, 1, "z", 0)
    const landingZ = n1 * TREAD
    addRun(n2, width / 2, landingZ + width / 2, 1, "x", n1)
  } else {
    // u-shape: два марша в противоположных направлениях + площадка
    const n1 = Math.ceil(count / 2)
    const n2 = count - n1
    addRun(n1, width / 2, 0, 1, "z", 0)
    const landingZ = n1 * TREAD
    addRun(n2, width / 2 + width + 100, landingZ, -1, "z", n1)
  }

  if (railing) {
    const railH = 900
    rails.push({ x: minX + 30, y: totalRise / 2 + railH / 2, z: (minZ + maxZ) / 2, w: 40, h: railH, d: maxZ - minZ })
  }

  return { steps, rails, hole: { minX, minZ, maxX, maxZ } }
}
