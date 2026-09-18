// Узлы и фрагменты (лист «АР. Узлы»): разрезы по типовым местам здания —
// цоколь с отмосткой, примыкание стены к перекрытию, оконный проём, парапет.
// Всё считается по самой модели: толщины стен и перекрытий, высота этажа,
// отметки, размеры проёмов. Масштаб 1:10, размеры в мм.

import type { Building, Floor } from "@/types/builder"
import type { Vec2 } from "@/core/geometry/math"

/** Штриховка по ГОСТ 2.306: бетон, утеплитель, кирпич, стяжка, грунт, металл. */
export type DetailPattern = "concrete" | "insulation" | "brick" | "screed" | "soil" | "metal" | "glass" | "wood" | "membrane"

export interface DetailShape {
  poly: Vec2[]
  pattern: DetailPattern
  /** толстая линия контура — несущее; тонкая — отделка */
  bold?: boolean
}

export interface DetailLine {
  a: Vec2
  b: Vec2
  dash?: boolean
  bold?: boolean
}

/** Выноска-полка: линия к точке и текст полкой (первая строка — номер слоя). */
export interface DetailNote {
  /** точка на конструкции */
  at: Vec2
  /** конец полки */
  to: Vec2
  text: string
}

export interface DetailDim {
  a: Vec2
  b: Vec2
  /** сдвиг размерной линии наружу, мм */
  offset: number
  text?: string
  /** вертикальный размер (по высоте) */
  vertical?: boolean
}

export interface Detail {
  id: string
  /** «Узел 1» */
  mark: string
  title: string
  /** знаменатель масштаба: 10 → М 1:10 */
  scale: number
  /** габарит поля узла, мм */
  box: { minX: number; minY: number; maxX: number; maxY: number }
  shapes: DetailShape[]
  lines: DetailLine[]
  notes: DetailNote[]
  dims: DetailDim[]
  /** состав слоёв — подпись под узлом */
  layers: string[]
}

const rect = (x: number, y: number, w: number, h: number): Vec2[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

function bboxOf(shapes: DetailShape[], lines: DetailLine[], notes: DetailNote[] = [], dims: DetailDim[] = []): Detail["box"] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const eat = (p: Vec2) => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  for (const s of shapes) s.poly.forEach(eat)
  for (const l of lines) { eat(l.a); eat(l.b) }
  // полки выносок и размерные линии тоже должны попасть в поле узла
  for (const n of notes) { eat(n.at); eat(n.to) }
  for (const d of dims) {
    const o = d.offset
    eat(d.vertical ? { x: d.a.x + o, y: d.a.y } : { x: d.a.x, y: d.a.y + o })
    eat(d.vertical ? { x: d.b.x + o, y: d.b.y } : { x: d.b.x, y: d.b.y + o })
  }
  return { minX, minY, maxX, maxY }
}

/** Характерные толщины по модели: наружная и внутренняя стена, перекрытие. */
export function structureSizes(floors: Floor[]): { wall: number; inner: number; slab: number; height: number } {
  const ext: number[] = []
  const inn: number[] = []
  for (const f of floors) {
    for (const id in f.wallGraph.edges) {
      const e = f.wallGraph.edges[id]
      ;(e.kind === "exterior" ? ext : inn).push(e.thickness)
    }
  }
  const median = (a: number[], d: number) => {
    if (!a.length) return d
    const s = [...a].sort((p, q) => p - q)
    return s[Math.floor(s.length / 2)]
  }
  const heights = floors.map((f) => f.height).filter((h) => h > 0)
  return {
    wall: median(ext, 400),
    inner: median(inn, 150),
    slab: 220,
    height: median(heights, 3000),
  }
}

/** Узел 1. Цоколь: стена, отмостка, пол по грунту. */
function plinthDetail(wall: number, apron = 1000): Detail {
  const below = 700 // условная глубина показа ниже отметки 0.000
  const shapes: DetailShape[] = [
    { poly: rect(0, 0, wall, 900), pattern: "brick", bold: true },
    // цокольная часть — бетон
    { poly: rect(-20, -below, wall + 40, below), pattern: "concrete", bold: true },
    // отмостка с уклоном от здания
    { poly: [{ x: wall, y: -40 }, { x: wall + apron, y: -140 }, { x: wall + apron, y: -220 }, { x: wall, y: -120 }], pattern: "concrete" },
    // подстилающий слой под отмосткой
    { poly: [{ x: wall, y: -120 }, { x: wall + apron, y: -220 }, { x: wall + apron, y: -320 }, { x: wall, y: -220 }], pattern: "soil" },
    // пол по грунту внутри: стяжка + утеплитель + подготовка
    { poly: rect(-900, -60, 900, 60), pattern: "screed" },
    { poly: rect(-900, -160, 900, 100), pattern: "insulation" },
    { poly: rect(-900, -320, 900, 160), pattern: "concrete" },
    // грунт основания
    { poly: rect(-900, -700, 900, 380), pattern: "soil" },
  ]
  const lines: DetailLine[] = [
    { a: { x: -900, y: 0 }, b: { x: -900, y: 900 }, dash: true },
    { a: { x: -900, y: 0 }, b: { x: 0, y: 0 } },
  ]
  return {
    id: "d1",
    mark: "Узел 1",
    title: "Цоколь и отмостка",
    scale: 10,
    box: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    shapes,
    lines,
    notes: [
      { at: { x: wall / 2, y: 700 }, to: { x: wall + 700, y: 1100 }, text: `Наружная стена ${wall} мм` },
      { at: { x: wall + apron / 2, y: -90 }, to: { x: wall + apron + 200, y: 500 }, text: `Отмостка ${apron} мм, уклон 3 %` },
      { at: { x: -450, y: -30 }, to: { x: -1500, y: 600 }, text: "Пол по грунту" },
    ],
    dims: [
      { a: { x: 0, y: 900 }, b: { x: wall, y: 900 }, offset: 260, text: `${wall}` },
      { a: { x: wall, y: -40 }, b: { x: wall + apron, y: -40 }, offset: -520, text: `${apron}` },
    ],
    layers: [
      "1. Стяжка цементно-песчаная армированная, 60 мм",
      "2. Утеплитель ЭППС, 100 мм",
      "3. Бетонная подготовка В7,5, 160 мм",
      "4. Уплотнённый грунт основания",
      "5. Отмостка бетонная по щебёночной подготовке, уклон 3 % от здания",
    ],
  }
}

/** Узел 2. Примыкание перекрытия к наружной стене. */
function slabDetail(wall: number, slab: number, height: number): Detail {
  const bearing = Math.min(200, Math.round(wall / 2))
  const y0 = 0
  const shapes: DetailShape[] = [
    { poly: rect(0, y0 - 900, wall, 900), pattern: "brick", bold: true },
    { poly: rect(0, y0 + slab, wall, 900), pattern: "brick", bold: true },
    // плита перекрытия с опиранием
    { poly: rect(wall - bearing, y0, bearing + 1400, slab), pattern: "concrete", bold: true },
    // утепление торца перекрытия снаружи
    { poly: rect(0, y0 - 40, wall - bearing, slab + 80), pattern: "insulation" },
    // пол: стяжка и звукоизоляция
    { poly: rect(wall - bearing, y0 + slab, bearing + 1400, 40), pattern: "insulation" },
    { poly: rect(wall - bearing, y0 + slab + 40, bearing + 1400, 60), pattern: "screed" },
  ]
  const lines: DetailLine[] = [
    { a: { x: wall, y: y0 + slab + 100 }, b: { x: wall + 1400, y: y0 + slab + 100 } },
    { a: { x: wall + 1200, y: y0 - 900 }, b: { x: wall + 1200, y: y0 + slab + 900 }, dash: true },
  ]
  return {
    id: "d2",
    mark: "Узел 2",
    title: "Примыкание перекрытия к наружной стене",
    scale: 10,
    box: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    shapes,
    lines,
    notes: [
      { at: { x: wall + 300, y: y0 + slab / 2 }, to: { x: wall + 1500, y: y0 - 500 }, text: `Плита перекрытия ${slab} мм` },
      { at: { x: wall - bearing / 2, y: y0 + slab / 2 }, to: { x: -900, y: y0 - 700 }, text: `Опирание ${bearing} мм` },
      { at: { x: wall / 2, y: y0 + slab + 400 }, to: { x: -900, y: y0 + slab + 800 }, text: `Высота этажа ${height} мм` },
    ],
    dims: [
      { a: { x: wall + 600, y: y0 }, b: { x: wall + 600, y: y0 + slab }, offset: 700, text: `${slab}`, vertical: true },
      { a: { x: 0, y: y0 + slab + 900 }, b: { x: wall, y: y0 + slab + 900 }, offset: 240, text: `${wall}` },
    ],
    layers: [
      "1. Плита перекрытия железобетонная",
      "2. Звукоизоляция под стяжку, 40 мм",
      "3. Стяжка цементно-песчаная, 60 мм",
      "4. Утепление торца перекрытия по наружной грани",
    ],
  }
}

/** Узел 3. Оконный проём: перемычка, четверть, подоконник, отлив. */
function windowDetail(wall: number, opening: { width: number; height: number; sill: number }): Detail {
  const lintel = 220
  const quarter = Math.min(65, Math.round(wall / 6))
  const shapes: DetailShape[] = [
    // показываем только приоконную часть стены — узел читается крупнее
    { poly: rect(0, 0, wall, 700), pattern: "brick", bold: true },
    { poly: rect(0, 700 + opening.height + 0, wall, 400), pattern: "brick", bold: true },
    // перемычка над проёмом
    { poly: rect(0, 700 + opening.height, wall, lintel), pattern: "concrete", bold: true },
    // оконный блок в четверти
    { poly: rect(quarter, 700, 90, opening.height), pattern: "glass", bold: true },
    // подоконная доска внутри и отлив снаружи
    { poly: rect(quarter + 90, 640, wall - quarter - 90 + 200, 40), pattern: "wood" },
    { poly: [{ x: -180, y: 640 }, { x: quarter, y: 700 }, { x: quarter, y: 660 }, { x: -180, y: 600 }], pattern: "metal" },
    // утепление откоса
    { poly: rect(0, 640, quarter, 60), pattern: "insulation" },
  ]
  const lines: DetailLine[] = [
    { a: { x: quarter + 45, y: 700 }, b: { x: quarter + 45, y: 700 + opening.height }, dash: true },
  ]
  return {
    id: "d3",
    mark: "Узел 3",
    title: "Оконный проём: перемычка, четверть, подоконник",
    scale: 10,
    box: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    shapes,
    lines,
    notes: [
      { at: { x: wall / 2, y: 700 + opening.height + lintel / 2 }, to: { x: wall + 900, y: 700 + opening.height + 700 }, text: `Перемычка ${lintel} мм` },
      { at: { x: quarter / 2, y: 900 }, to: { x: -1100, y: 1200 }, text: `Четверть ${quarter} мм` },
      { at: { x: quarter + 45, y: 900 }, to: { x: wall + 900, y: 1100 }, text: `Оконный блок ${opening.width}×${opening.height}` },
      { at: { x: -90, y: 630 }, to: { x: -1100, y: 300 }, text: "Отлив оцинкованный" },
    ],
    dims: [
      { a: { x: wall + 300, y: 700 }, b: { x: wall + 300, y: 700 + opening.height }, offset: 500, text: `${opening.height}`, vertical: true },
      { a: { x: wall + 300, y: 0 }, b: { x: wall + 300, y: 700 }, offset: 500, text: `${opening.sill}`, vertical: true },
    ],
    layers: [
      "1. Оконный блок из ПВХ-профиля с двухкамерным стеклопакетом",
      "2. Монтажный шов по ГОСТ 30971: пена, ПСУЛ снаружи, пароизоляция внутри",
      "3. Отлив оцинкованный с уклоном от окна",
      "4. Подоконная доска",
    ],
  }
}

/** Узел 4. Парапет плоской кровли. */
function parapetDetail(wall: number, slab: number, roofThickness: number): Detail {
  const parapet = 600
  const shapes: DetailShape[] = [
    { poly: rect(0, -900, wall, 900 + parapet), pattern: "brick", bold: true },
    // плита покрытия
    { poly: rect(wall - 200, -slab, 1600, slab), pattern: "concrete", bold: true },
    // кровельный пирог
    { poly: rect(wall, 0, 1400, Math.max(120, roofThickness - 80)), pattern: "insulation" },
    { poly: rect(wall, Math.max(120, roofThickness - 80), 1400, 60), pattern: "screed" },
    { poly: rect(wall, Math.max(180, roofThickness - 20), 1400, 30), pattern: "membrane" },
    // фартук парапета
    { poly: [{ x: -80, y: parapet }, { x: wall + 80, y: parapet }, { x: wall + 80, y: parapet - 60 }, { x: -80, y: parapet - 60 }], pattern: "metal" },
    // заведение мембраны на парапет
    { poly: rect(wall - 30, Math.max(180, roofThickness - 20), 30, parapet - Math.max(180, roofThickness - 20)), pattern: "membrane" },
  ]
  const lines: DetailLine[] = [
    { a: { x: wall + 1400, y: -slab }, b: { x: wall + 1400, y: parapet }, dash: true },
  ]
  return {
    id: "d4",
    mark: "Узел 4",
    title: "Парапет плоской кровли",
    scale: 10,
    box: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    shapes,
    lines,
    notes: [
      { at: { x: wall / 2, y: parapet - 30 }, to: { x: -1200, y: parapet + 500 }, text: "Фартук парапетный оцинкованный" },
      { at: { x: wall + 700, y: 120 }, to: { x: wall + 1600, y: 800 }, text: `Кровельный пирог ${roofThickness} мм` },
      { at: { x: wall + 700, y: -slab / 2 }, to: { x: wall + 1600, y: -900 }, text: `Плита покрытия ${slab} мм` },
    ],
    dims: [
      { a: { x: wall - 400, y: 0 }, b: { x: wall - 400, y: parapet }, offset: -900, text: `${parapet}`, vertical: true },
    ],
    layers: [
      "1. Плита покрытия железобетонная",
      "2. Пароизоляция",
      "3. Утеплитель по уклонообразующему слою",
      "4. Стяжка армированная, 60 мм",
      "5. Кровельная ПВХ-мембрана с заведением на парапет и креплением под фартук",
    ],
  }
}

/** Узел 4-а. Карниз скатной кровли: мауэрлат, стропило, обрешётка, водосток. */
function eavesDetail(wall: number, slab: number, pitchDeg: number, overhang: number): Detail {
  const k = Math.tan((pitchDeg * Math.PI) / 180)
  const run = wall + overhang
  const shapes: DetailShape[] = [
    { poly: rect(0, -900, wall, 900), pattern: "brick", bold: true },
    // мауэрлат по обрезу стены
    { poly: rect(wall - 200, 0, 150, 150), pattern: "wood", bold: true },
    // стропильная нога с уклоном
    {
      poly: [
        { x: -overhang, y: 150 + k * 0 },
        { x: run, y: 150 + k * (run + overhang) },
        { x: run, y: 230 + k * (run + overhang) },
        { x: -overhang, y: 230 },
      ],
      pattern: "wood",
      bold: true,
    },
    // утеплитель между стропилами и обрешётка
    { poly: rect(wall - 200, -150, 1400, 150), pattern: "insulation" },
    { poly: [{ x: -overhang, y: 230 }, { x: run, y: 230 + k * (run + overhang) }, { x: run, y: 260 + k * (run + overhang) }, { x: -overhang, y: 260 }], pattern: "metal" },
  ]
  const lines: DetailLine[] = [
    { a: { x: -overhang, y: 150 }, b: { x: -overhang, y: -300 }, dash: true },
  ]
  return {
    id: "d4",
    mark: "Узел 4",
    title: "Карниз скатной кровли",
    scale: 10,
    box: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    shapes,
    lines,
    notes: [
      { at: { x: wall - 120, y: 80 }, to: { x: wall + 900, y: -500 }, text: "Мауэрлат 150×150" },
      { at: { x: wall / 2, y: 200 }, to: { x: -overhang - 700, y: 900 }, text: `Стропило, уклон ${Math.round(pitchDeg)}°` },
      { at: { x: -overhang / 2, y: 245 }, to: { x: -overhang - 700, y: 500 }, text: `Свес ${overhang} мм, водосточный жёлоб` },
    ],
    dims: [
      { a: { x: -overhang, y: 150 }, b: { x: wall, y: 150 }, offset: -700, text: `${overhang + wall}` },
    ],
    layers: [
      "1. Кровельное покрытие по обрешётке",
      "2. Гидроветрозащитная мембрана",
      "3. Утеплитель между стропилами",
      "4. Пароизоляция, подшивка",
      "5. Водосточный жёлоб по свесу с уклоном к воронке",
    ],
  }
}

/**
 * Узлы по модели здания. Парапет — только для плоской кровли, оконный узел —
 * по самому частому окну в здании (иначе по типовому 1500×1500).
 */
export function buildDetails(building: Pick<Building, "floors">): Detail[] {
  const floors = building.floors
  const s = structureSizes(floors)
  const windows = floors.flatMap((f) => f.openings.filter((o) => o.type === "window" && o.variant !== "curtain"))
  const typical = windows.sort((a, b) => b.width * b.height - a.width * a.height)[Math.floor(windows.length / 2)]
  const win = typical
    ? { width: typical.width, height: typical.height, sill: typical.sillHeight }
    : { width: 1500, height: 1500, sill: 850 }
  // кровля задаётся на этаже — берём верхний этаж, у которого она есть
  const roof = [...floors].sort((a, b) => b.elevation - a.elevation).find((f) => f.roof)?.roof
  const thickness = Math.max(200, Math.round(roof?.thickness ?? 300))
  const out = [
    plinthDetail(s.wall),
    slabDetail(s.wall, s.slab, s.height),
    windowDetail(s.wall, win),
    !roof || roof.type === "flat" ? parapetDetail(s.wall, s.slab, thickness) : eavesDetail(s.wall, s.slab, roof.pitchDeg || 25, roof.overhang || 500),
  ]
  // габарит узла считаем в конце: в поле должны попасть и выноски, и размеры
  return out.map((d) => ({ ...d, box: bboxOf(d.shapes, d.lines, d.notes, d.dims) }))
}
