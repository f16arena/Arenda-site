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
  /** наклон (рад) — для поручня вдоль марша */
  tilt?: number
  /** ось наклона: марш вдоль Z наклоняет поручень вокруг X и наоборот */
  tiltAxis?: "x" | "z"
}

export interface StairGeometry {
  steps: StepBox[]
  rails: StepBox[]
  /** наклонные плоскости маршей: невидимые — по ним человек в обходе поднимается */
  ramps?: StepBox[]
  hole: { minX: number; minZ: number; maxX: number; maxZ: number } // вырез в перекрытии выше, мм (локально)
}

const RISER = 170
const TREAD = 280
const STEP_T = 60

/** Крыльцо: площадка у двери (верх = отметка пола) и ступени наружу вниз до земли. */
export const PORCH_LANDING = 1400

export function generatePorch(rise: number, width: number, tread = TREAD): StairGeometry {
  const TREAD_P = tread
  const count = Math.max(1, Math.round(rise / RISER))
  const riser = rise / count
  const steps: StepBox[] = []
  // площадка: z 0..LANDING, во всю высоту
  steps.push({ x: 0, y: -rise / 2, z: PORCH_LANDING / 2, w: width, h: rise, d: PORCH_LANDING })
  for (let j = 1; j < count; j++) {
    const h = rise - j * riser
    steps.push({ x: 0, y: -rise + h / 2, z: PORCH_LANDING + (j - 1) * TREAD_P + TREAD_P / 2, w: width, h, d: TREAD_P })
  }
  const depth = PORCH_LANDING + (count - 1) * TREAD_P
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

export function generateStair(shape: StairShape, totalRise: number, width: number, railing: boolean, depth?: number, tread?: number): StairGeometry {
  if (shape === "column") return generateColumn(totalRise, width, depth ?? width)
  if (shape === "porch") return generatePorch(totalRise, width, tread ?? TREAD)
  if (shape === "elevator") return generateElevator(totalRise, width)
  // проступь: по умолчанию 280 мм; задаётся длиной марша в редакторе
  const T = tread && tread > 0 ? tread : TREAD
  const count = Math.max(2, Math.round(totalRise / RISER))
  const riser = totalRise / count
  const steps: StepBox[] = []
  const rails: StepBox[] = []
  const ramps: StepBox[] = []
  let minX = 0
  let minZ = 0
  let maxX = width
  let maxZ = 0

  // Подступёнок под проступью — марш выглядит как настоящая лестница, а не как
  // висящие в воздухе плиты, и в разрезе читается правильно.
  const addRiser = (idx: number, cx: number, cz: number, dir: 1 | -1, axis: "z" | "x") => {
    const h = Math.max(20, riser - STEP_T)
    const y = idx * riser + h / 2
    if (axis === "z") steps.push({ x: cx, y, z: cz - dir * (T / 2 - 30), w: width, h, d: 60 })
    else steps.push({ x: cx - dir * (T / 2 - 30), y, z: cz, w: 60, h, d: width })
  }
  // Перила марша: стойки через ступень и наклонный поручень.
  const addRail = (n: number, ox: number, oz: number, dir: 1 | -1, axis: "z" | "x", startStep: number) => {
    if (!railing || n < 1) return
    const RAIL_H = 900
    const edge = axis === "z" ? ox - width / 2 + 40 : oz - width / 2 + 40
    for (let i = 0; i < n; i += 2) {
      const idx = startStep + i
      const top = (idx + 1) * riser
      const alongC = dir * (i * T + T / 2)
      if (axis === "z") rails.push({ x: edge, y: top + RAIL_H / 2, z: oz + alongC, w: 45, h: RAIL_H, d: 45 })
      else rails.push({ x: ox + alongC, y: top + RAIL_H / 2, z: edge, w: 45, h: RAIL_H, d: 45 })
    }
    const run = n * T
    const rise = n * riser
    const L = Math.hypot(run, rise)
    const tilt = Math.atan2(rise, run)
    const midAlong = dir * (run / 2)
    const midY = startStep * riser + rise / 2 + RAIL_H
    if (axis === "z") rails.push({ x: edge, y: midY, z: oz + midAlong, w: 60, h: 60, d: L, tilt: -dir * tilt, tiltAxis: "x" })
    else rails.push({ x: ox + midAlong, y: midY, z: edge, w: L, h: 60, d: 60, tilt: dir * tilt, tiltAxis: "z" })
  }

  // пандус вдоль марша: по нему в обходе человек плавно поднимается — коллайдер
  // Babylon не умеет «шагать» на 170 мм ступень
  const addRamp = (n: number, ox: number, oz: number, dir: 1 | -1, axis: "z" | "x", startStep: number) => {
    if (n < 1) return
    const run = n * T
    const rise = n * riser
    const L = Math.hypot(run, rise)
    const tilt = Math.atan2(rise, run)
    const midAlong = dir * (run / 2)
    const midY = startStep * riser + rise / 2
    if (axis === "z") ramps.push({ x: ox, y: midY, z: oz + midAlong, w: width, h: 60, d: L, tilt: -dir * tilt, tiltAxis: "x" })
    else ramps.push({ x: ox + midAlong, y: midY, z: oz, w: L, h: 60, d: width, tilt: dir * tilt, tiltAxis: "z" })
  }

  const addRun = (n: number, ox: number, oz: number, dir: 1 | -1, axis: "z" | "x", startStep: number) => {
    addRail(n, ox, oz, dir, axis, startStep)
    addRamp(n, ox, oz, dir, axis, startStep)
    for (let i = 0; i < n; i++) {
      const idx = startStep + i
      const y = (idx + 1) * riser - STEP_T / 2
      if (axis === "z") {
        const z = oz + dir * (i * T + T / 2)
        steps.push({ x: ox, y, z, w: width, h: STEP_T, d: T })
        addRiser(idx, ox, z, dir, axis)
        minZ = Math.min(minZ, z - T / 2)
        maxZ = Math.max(maxZ, z + T / 2)
        minX = Math.min(minX, ox - width / 2)
        maxX = Math.max(maxX, ox + width / 2)
      } else {
        const x = ox + dir * (i * T + T / 2)
        steps.push({ x, y, z: oz, w: T, h: STEP_T, d: width })
        addRiser(idx, x, oz, dir, axis)
        minX = Math.min(minX, x - T / 2)
        maxX = Math.max(maxX, x + T / 2)
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
    const landingZ = n1 * T
    // промежуточная площадка: без неё между маршами оставалась дыра
    steps.push({ x: width / 2, y: n1 * riser - STEP_T / 2, z: landingZ + width / 2, w: width, h: STEP_T, d: width })
    minZ = Math.min(minZ, landingZ)
    maxZ = Math.max(maxZ, landingZ + width)
    addRun(n2, width / 2, landingZ + width / 2, 1, "x", n1)
  } else {
    // u-shape: два марша в противоположных направлениях + площадка
    const n1 = Math.ceil(count / 2)
    const n2 = count - n1
    addRun(n1, width / 2, 0, 1, "z", 0)
    const landingZ = n1 * T
    steps.push({ x: width + 50, y: n1 * riser - STEP_T / 2, z: landingZ + width / 2, w: 2 * width + 100, h: STEP_T, d: width })
    minZ = Math.min(minZ, landingZ)
    maxZ = Math.max(maxZ, landingZ + width)
    minX = Math.min(minX, 0)
    maxX = Math.max(maxX, 2 * width + 100)
    addRun(n2, width / 2 + width + 100, landingZ, -1, "z", n1)
  }

  return { steps, rails, ramps, hole: { minX, minZ, maxX, maxZ } }
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
  tread?: number
}

/** Высота подъёма: лестница — во весь этаж, крыльцо — своя (по умолчанию 450 мм). */
export function stairRise(stair: StairPlacement, floorHeight: number): number {
  // крыльцо — своя высота; лестница — высота этажа, если не задана своя
  return stair.shape === "porch" ? Math.max(150, stair.rise ?? 450) : stair.rise && stair.rise > 0 && stair.shape !== "elevator" && stair.shape !== "column" ? stair.rise : floorHeight
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
  const geo = generateStair(stair.shape, stairRise(stair, floorHeight), stair.width, stair.railing, stair.depth, stair.tread)
  return geo.steps.map((b) => [
    stairToWorld(stair, b.x - b.w / 2, b.z - b.d / 2),
    stairToWorld(stair, b.x + b.w / 2, b.z - b.d / 2),
    stairToWorld(stair, b.x + b.w / 2, b.z + b.d / 2),
    stairToWorld(stair, b.x - b.w / 2, b.z + b.d / 2),
  ])
}
