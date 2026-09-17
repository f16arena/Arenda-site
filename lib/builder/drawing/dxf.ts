// DXF (AutoCAD R12, ASCII) из чертежа этажа. Пространство модели 1:1 в мм:
// инженер открывает файл в AutoCAD и сразу меряет настоящие размеры.
//
// R12 выбран сознательно: его без вопросов открывают AutoCAD, nanoCAD, BricsCAD,
// КОМПАС и LibreCAD. Кириллица — через \U+XXXX, иначе текст превращается в
// «кракозябры» при разных кодовых страницах.

import { BUBBLE_R, DIM_BASE, DIM_STEP, AXIS_GAP, areaText, type FloorDrawing, type Pt, type Side } from "./floor-drawing"

const LAYERS = [
  { name: "A-WALL", color: 7 }, // стены
  { name: "A-OPEN", color: 4 }, // окна, двери
  { name: "A-DIMS", color: 1 }, // размеры
  { name: "A-TEXT", color: 7 }, // подписи помещений
  { name: "A-AXES", color: 8 }, // оси
]

function enc(text: string): string {
  let out = ""
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    out += code < 128 ? ch : `\\U+${code.toString(16).toUpperCase().padStart(4, "0")}`
  }
  return out
}

class Writer {
  private rows: string[] = []
  pair(code: number, value: string | number) {
    this.rows.push(String(code), typeof value === "number" ? String(Math.round(value * 1000) / 1000) : value)
  }
  line(layer: string, a: Pt, b: Pt) {
    this.pair(0, "LINE"); this.pair(8, layer)
    this.pair(10, a.x); this.pair(20, a.y); this.pair(30, 0)
    this.pair(11, b.x); this.pair(21, b.y); this.pair(31, 0)
  }
  solid(layer: string, q: Pt[]) {
    // порядок вершин SOLID в DXF: 1, 2, 4, 3 — «бантик» без перестановки
    const [p1, p2, p3, p4] = q
    this.pair(0, "SOLID"); this.pair(8, layer)
    this.pair(10, p1.x); this.pair(20, p1.y); this.pair(30, 0)
    this.pair(11, p2.x); this.pair(21, p2.y); this.pair(31, 0)
    this.pair(12, p4.x); this.pair(22, p4.y); this.pair(32, 0)
    this.pair(13, p3.x); this.pair(23, p3.y); this.pair(33, 0)
  }
  arc(layer: string, c: Pt, r: number, start: number, end: number) {
    this.pair(0, "ARC"); this.pair(8, layer)
    this.pair(10, c.x); this.pair(20, c.y); this.pair(30, 0)
    this.pair(40, r); this.pair(50, start); this.pair(51, end)
  }
  circle(layer: string, c: Pt, r: number) {
    this.pair(0, "CIRCLE"); this.pair(8, layer)
    this.pair(10, c.x); this.pair(20, c.y); this.pair(30, 0); this.pair(40, r)
  }
  text(layer: string, at: Pt, height: number, value: string, rotation = 0) {
    // выравнивание по центру: 72 = 1 (центр), 73 = 2 (середина), точка — 11/21
    this.pair(0, "TEXT"); this.pair(8, layer)
    this.pair(10, at.x); this.pair(20, at.y); this.pair(30, 0)
    this.pair(40, height); this.pair(1, enc(value)); this.pair(50, rotation)
    this.pair(72, 1); this.pair(73, 2)
    this.pair(11, at.x); this.pair(21, at.y); this.pair(31, 0)
  }
  toString() {
    return this.rows.join("\r\n") + "\r\n"
  }
}

function normalFor(side: Side): Pt {
  return side === "top" ? { x: 0, y: 1 } : side === "bottom" ? { x: 0, y: -1 } : side === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 }
}

/** Файл DXF. scale — масштаб листа (1:N): размеры текста и отступов даны в мм листа. */
export function floorDrawingToDxf(d: FloorDrawing, scale: number, title: string): string {
  const w = new Writer()
  const k = scale // мм листа → мм модели

  w.pair(0, "SECTION"); w.pair(2, "HEADER")
  w.pair(9, "$ACADVER"); w.pair(1, "AC1009")
  w.pair(9, "$INSUNITS"); w.pair(70, 4) // миллиметры
  w.pair(9, "$EXTMIN"); w.pair(10, d.bounds.minX); w.pair(20, d.bounds.minY); w.pair(30, 0)
  w.pair(9, "$EXTMAX"); w.pair(10, d.bounds.maxX); w.pair(20, d.bounds.maxY); w.pair(30, 0)
  w.pair(0, "ENDSEC")

  w.pair(0, "SECTION"); w.pair(2, "TABLES")
  w.pair(0, "TABLE"); w.pair(2, "LTYPE"); w.pair(70, 1)
  w.pair(0, "LTYPE"); w.pair(2, "CONTINUOUS"); w.pair(70, 0); w.pair(3, "Solid line"); w.pair(72, 65); w.pair(73, 0); w.pair(40, 0)
  w.pair(0, "ENDTAB")
  w.pair(0, "TABLE"); w.pair(2, "LAYER"); w.pair(70, LAYERS.length)
  for (const l of LAYERS) {
    w.pair(0, "LAYER"); w.pair(2, l.name); w.pair(70, 0); w.pair(62, l.color); w.pair(6, "CONTINUOUS")
  }
  w.pair(0, "ENDTAB")
  w.pair(0, "ENDSEC")

  w.pair(0, "SECTION"); w.pair(2, "ENTITIES")

  for (const q of d.wallSolids) w.solid("A-WALL", q)
  for (const [a, b] of d.thinLines) w.line("A-OPEN", a, b)
  for (const a of d.arcs) w.arc("A-OPEN", a.c, a.r, a.start, a.end)

  const th = 2.5 * k // высота текста 2,5 мм на листе
  for (const r of d.rooms) {
    if (r.number) w.text("A-TEXT", { x: r.at.x, y: r.at.y + th * 0.8 }, th, `№ ${r.number}`)
    w.text("A-TEXT", { x: r.at.x, y: r.at.y - th * 0.8 }, th, areaText(r.areaM2))
  }

  // размеры: линия, выносные, засечки 45°, текст над линией
  const tick = 1.5 * k
  for (const dim of d.dims) {
    const n = normalFor(dim.side)
    const off = (DIM_BASE + DIM_STEP * (dim.level - 1)) * k
    const vert = dim.side === "left" || dim.side === "right"
    // линия откладывается от края всего плана, а не от своей стены
    const a = vert ? { x: dim.edge + n.x * off, y: dim.a.y } : { x: dim.a.x, y: dim.edge + n.y * off }
    const b = vert ? { x: dim.edge + n.x * off, y: dim.b.y } : { x: dim.b.x, y: dim.edge + n.y * off }
    w.line("A-DIMS", a, b)
    w.line("A-DIMS", dim.a, { x: a.x + n.x * 1.5 * k, y: a.y + n.y * 1.5 * k })
    w.line("A-DIMS", dim.b, { x: b.x + n.x * 1.5 * k, y: b.y + n.y * 1.5 * k })
    for (const p of [a, b]) w.line("A-DIMS", { x: p.x - tick, y: p.y - tick }, { x: p.x + tick, y: p.y + tick })
    const vertical = dim.side === "left" || dim.side === "right"
    const mid = { x: (a.x + b.x) / 2 + (vertical ? -1.5 * k : 0), y: (a.y + b.y) / 2 + (vertical ? 0 : 1.5 * k) }
    if (Math.hypot(b.x - a.x, b.y - a.y) >= 6 * k) w.text("A-DIMS", mid, th, dim.text, vertical ? 90 : 0)
  }

  // оси с марками в кружках
  const reach = (DIM_BASE + DIM_STEP * 3 + AXIS_GAP) * k
  const R = BUBBLE_R * k
  for (const ax of d.axes) {
    if (ax.dir === "v") {
      const p0 = { x: ax.at, y: d.bounds.minY - reach }, p1 = { x: ax.at, y: d.bounds.maxY + reach }
      w.line("A-AXES", p0, p1)
      for (const c of [{ x: ax.at, y: p0.y - R }, { x: ax.at, y: p1.y + R }]) {
        w.circle("A-AXES", c, R)
        w.text("A-AXES", c, th * 1.2, ax.label)
      }
    } else {
      const p0 = { x: d.bounds.minX - reach, y: ax.at }, p1 = { x: d.bounds.maxX + reach, y: ax.at }
      w.line("A-AXES", p0, p1)
      for (const c of [{ x: p0.x - R, y: ax.at }, { x: p1.x + R, y: ax.at }]) {
        w.circle("A-AXES", c, R)
        w.text("A-AXES", c, th * 1.2, ax.label)
      }
    }
  }

  // заголовок под планом
  w.text("A-TEXT", { x: (d.bounds.minX + d.bounds.maxX) / 2, y: d.bounds.minY - reach - R * 2 - 8 * k }, 5 * k, `${title}  М 1:${scale}`)

  w.pair(0, "ENDSEC")
  w.pair(0, "EOF")
  return w.toString()
}
