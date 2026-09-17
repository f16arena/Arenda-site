// ADR: Параметрические лестницы (§4.3.7). Автоподбор числа ступеней из высоты этажа
// (подступёнок ~170, проступь ~280 мм). Формы: прямая / Г / П / винтовая. Возвращает
// локальные коробки ступеней (+ опц. перила) и прямоугольник выреза в перекрытии выше.
// Координаты локальные [x,y,z] мм относительно position лестницы; поворот — в билдере.

export type StairShape = "straight" | "l" | "u" | "spiral" | "porch" | "elevator" | "column"

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

/** Крыльцо: площадка у двери (верх = отметка пола) и ступени наружу вниз до земли. */
export const PORCH_LANDING = 1400

export function generatePorch(rise: number, width: number): StairGeometry {
  const count = Math.max(1, Math.round(rise / RISER))
  const riser = rise / count
  const steps: StepBox[] = []
  // площадка: z 0..LANDING, во всю высоту
  steps.push({ x: 0, y: -rise / 2, z: PORCH_LANDING / 2, w: width, h: rise, d: PORCH_LANDING })
  for (let j = 1; j < count; j++) {
    const h = rise - j * riser
    steps.push({ x: 0, y: -rise + h / 2, z: PORCH_LANDING + (j - 1) * TREAD + TREAD / 2, w: width, h, d: TREAD })
  }
  const depth = PORCH_LANDING + (count - 1) * TREAD
  return { steps, rails: [], hole: { minX: -width / 2, minZ: 0, maxX: width / 2, maxZ: depth } }
}

/** Лифтовая шахта: стены 150 мм, дверной проём 1000 мм спереди (z = 0), кабина внутри. */
export const SHAFT_WALL = 150
export const LIFT_DOOR = 1000

export function generateElevator(height: number, width: number): StairGeometry {
  const depth = Math.round(width * 1.1)
  const t = SHAFT_WALL
  const steps: StepBox[] = []
  const y = height / 2
  // боковые и задняя стены
  steps.push({ x: -width / 2 + t / 2, y, z: depth / 2, w: t, h: height, d: depth })
  steps.push({ x: width / 2 - t / 2, y, z: depth / 2, w: t, h: height, d: depth })
  steps.push({ x: 0, y, z: depth - t / 2, w: width, h: height, d: t })
  // передняя стена с проёмом по центру
  const side = (width - LIFT_DOOR) / 2
  if (side > 1) {
    steps.push({ x: -width / 2 + side / 2, y, z: t / 2, w: side, h: height, d: t })
    steps.push({ x: width / 2 - side / 2, y, z: t / 2, w: side, h: height, d: t })
  }
  steps.push({ x: 0, y: 2100 + (height - 2100) / 2, z: t / 2, w: LIFT_DOOR, h: height - 2100, d: t })
  // кабина — металлом
  const cw = width - 2 * t - 200, cd = depth - 2 * t - 200
  const rails: StepBox[] = [{ x: 0, y: 1200, z: depth / 2, w: cw, h: 2300, d: cd }]
  return { steps, rails, hole: { minX: -width / 2, minZ: 0, maxX: width / 2, maxZ: depth } }
}

/** Конструктивная колонна: сечение width × depth, на всю высоту этажа, центр в position. */
export function generateColumn(height: number, width: number, depth: number): StairGeometry {
  return { steps: [{ x: 0, y: height / 2, z: 0, w: width, h: height, d: depth }], rails: [], hole: { minX: -width / 2, minZ: -depth / 2, maxX: width / 2, maxZ: depth / 2 } }
}

export function generateStair(shape: StairShape, totalRise: number, width: number, railing: boolean, depth?: number): StairGeometry {
  if (shape === "column") return generateColumn(totalRise, width, depth ?? width)
  if (shape === "porch") return generatePorch(totalRise, width)
  if (shape === "elevator") return generateElevator(totalRise, width)
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

export interface StairPlacement {
  shape: StairShape
  position: { x: number; y: number }
  rotationDeg: number
  width: number
  railing: boolean
  mirror?: boolean
  rise?: number
  depth?: number
}

/** Высота подъёма: лестница — во весь этаж, крыльцо — своя (по умолчанию 450 мм). */
export function stairRise(stair: StairPlacement, floorHeight: number): number {
  return stair.shape === "porch" ? Math.max(150, stair.rise ?? 450) : floorHeight
}

/** Локальная точка лестницы (x, z) → мировые мм плоскости этажа. */
export function stairToWorld(stair: StairPlacement, x: number, z: number): { x: number; y: number } {
  const rot = (stair.rotationDeg * Math.PI) / 180
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const cx = x * (stair.mirror ? -1 : 1)
  return { x: stair.position.x + (cx * cos + z * sin), y: stair.position.y + (-cx * sin + z * cos) }
}

/** Контуры ступеней/площадок в плане (мировые мм) — для чертежа. */
export function stairPlanRects(stair: StairPlacement, floorHeight: number): { x: number; y: number }[][] {
  const geo = generateStair(stair.shape, stairRise(stair, floorHeight), stair.width, stair.railing, stair.depth)
  return geo.steps.map((b) => [
    stairToWorld(stair, b.x - b.w / 2, b.z - b.d / 2),
    stairToWorld(stair, b.x + b.w / 2, b.z - b.d / 2),
    stairToWorld(stair, b.x + b.w / 2, b.z + b.d / 2),
    stairToWorld(stair, b.x - b.w / 2, b.z + b.d / 2),
  ])
}
