// Импорт DXF (AutoCAD, nanoCAD, КОМПАС) как подложки этажа — в настоящем
// масштабе, без калибровки рулеткой.
//
// Разбираем ASCII DXF: LINE, LWPOLYLINE (с дугами-bulge), POLYLINE/VERTEX,
// CIRCLE, ARC, ELLIPSE (приближённо), SPLINE (по управляющим точкам) и INSERT
// (блоки с переносом, масштабом и поворотом, вложенность до 6). Текст и
// штриховки пропускаем — подложке нужны линии. Единицы — по $INSUNITS.

export type Seg = [number, number, number, number]

export interface DxfImport {
  /** отрезки в мм плана (ось Y вверх, как в CAD) */
  segments: Seg[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  /** во сколько раз умножили единицы файла, чтобы получить мм */
  unitToMm: number
  layers: string[]
}

type Pair = [number, string]

function pairs(text: string): Pair[] {
  const lines = text.split(/\r\n|\r|\n/)
  const out: Pair[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10)
    if (Number.isNaN(code)) {
      i -= 1 // сбились с шага: пропускаем одну строку
      continue
    }
    out.push([code, lines[i + 1]])
  }
  return out
}

const UNITS: Record<number, number> = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 14: 100 }

interface Entity {
  type: string
  layer: string
  codes: Pair[]
}

/** Разбить последовательность пар на сущности (по коду 0). */
function entities(ps: Pair[], from: number, to: number): Entity[] {
  const out: Entity[] = []
  let cur: Entity | null = null
  for (let i = from; i < to; i++) {
    const [c, v] = ps[i]
    if (c === 0) {
      if (cur) out.push(cur)
      cur = { type: v.trim(), layer: "0", codes: [] }
    } else if (cur) {
      if (c === 8) cur.layer = v.trim()
      cur.codes.push([c, v])
    }
  }
  if (cur) out.push(cur)
  return out
}

function num(e: Entity, code: number, def = 0): number {
  const p = e.codes.find((x) => x[0] === code)
  return p ? parseFloat(p[1]) : def
}

function all(e: Entity, code: number): number[] {
  return e.codes.filter((x) => x[0] === code).map((x) => parseFloat(x[1]))
}

type Xf = (x: number, y: number) => [number, number]

function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): Array<[number, number]> {
  let sweep = a1 - a0
  while (sweep <= 0) sweep += Math.PI * 2
  const n = Math.max(6, Math.min(96, Math.ceil((sweep * r) / Math.max(r / 12, 1e-9) / 4)))
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= n; i++) {
    const t = a0 + (sweep * i) / n
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)])
  }
  return pts
}

/** Дуга полилинии между двумя вершинами по bulge (tan(угол/4)). */
function bulgePts(x1: number, y1: number, x2: number, y2: number, b: number): Array<[number, number]> {
  if (Math.abs(b) < 1e-9) return [[x1, y1], [x2, y2]]
  const theta = 4 * Math.atan(b)
  const chord = Math.hypot(x2 - x1, y2 - y1)
  if (chord < 1e-9) return [[x1, y1]]
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2))
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const d = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2))
  const ux = (x2 - x1) / chord, uy = (y2 - y1) / chord
  // центр слева от хорды при положительном bulge и дуге меньше полуокружности
  const side = (b > 0 ? 1 : -1) * (Math.abs(theta) > Math.PI ? -1 : 1)
  const cx = mx - uy * d * side, cy = my + ux * d * side
  let a0 = Math.atan2(y1 - cy, x1 - cx)
  let a1 = Math.atan2(y2 - cy, x2 - cx)
  if (b < 0) [a0, a1] = [a1, a0]
  const pts = arcPts(cx, cy, r, a0, a1)
  return b < 0 ? pts.reverse() : pts
}

export function parseDxf(text: string): DxfImport {
  const ps = pairs(text)
  // заголовок: единицы
  let insunits = 0
  for (let i = 0; i < ps.length; i++) {
    if (ps[i][0] === 9 && ps[i][1].trim() === "$INSUNITS") {
      const v = ps.slice(i + 1, i + 4).find((p) => p[0] === 70)
      if (v) insunits = parseInt(v[1], 10)
      break
    }
  }

  // секции
  const sections = new Map<string, [number, number]>()
  for (let i = 0; i < ps.length; i++) {
    if (ps[i][0] === 0 && ps[i][1].trim() === "SECTION" && ps[i + 1]?.[0] === 2) {
      const name = ps[i + 1][1].trim()
      let j = i + 2
      while (j < ps.length && !(ps[j][0] === 0 && ps[j][1].trim() === "ENDSEC")) j++
      sections.set(name, [i + 2, j])
    }
  }

  // блоки
  const blocks = new Map<string, { bx: number; by: number; ents: Entity[] }>()
  const bs = sections.get("BLOCKS")
  if (bs) {
    const ents = entities(ps, bs[0], bs[1])
    let cur: { name: string; bx: number; by: number; ents: Entity[] } | null = null
    for (const e of ents) {
      if (e.type === "BLOCK") {
        const nameP = e.codes.find((x) => x[0] === 2)
        cur = { name: nameP ? nameP[1].trim() : "", bx: num(e, 10), by: num(e, 20), ents: [] }
      } else if (e.type === "ENDBLK") {
        if (cur) blocks.set(cur.name, { bx: cur.bx, by: cur.by, ents: cur.ents })
        cur = null
      } else if (cur) cur.ents.push(e)
    }
  }

  const segs: Seg[] = []
  const layers = new Set<string>()
  const poly = (pts: Array<[number, number]>, xf: Xf) => {
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = xf(pts[i - 1][0], pts[i - 1][1])
      const [bx, by] = xf(pts[i][0], pts[i][1])
      if (Number.isFinite(ax + ay + bx + by)) segs.push([ax, ay, bx, by])
    }
  }

  // объекты блока на слое «0» принимают слой вставки — как в AutoCAD
  const draw = (ents: Entity[], xf: Xf, depth: number, inherit?: string) => {
    for (let k = 0; k < ents.length; k++) {
      const e = inherit && ents[k].layer === "0" ? { ...ents[k], layer: inherit } : ents[k]
      switch (e.type) {
        case "LINE":
          layers.add(e.layer)
          poly([[num(e, 10), num(e, 20)], [num(e, 11), num(e, 21)]], xf)
          break
        case "LWPOLYLINE": {
          layers.add(e.layer)
          const xs = all(e, 10), ys = all(e, 20)
          // bulge (42) относится к вершине, после которой стоит
          const verts: Array<{ x: number; y: number; b: number }> = []
          for (const [c, v] of e.codes) {
            if (c === 10) verts.push({ x: parseFloat(v), y: 0, b: 0 })
            else if (c === 20 && verts.length) verts[verts.length - 1].y = parseFloat(v)
            else if (c === 42 && verts.length) verts[verts.length - 1].b = parseFloat(v)
          }
          if (verts.length !== xs.length || xs.length !== ys.length) break
          const closed = (num(e, 70) & 1) === 1
          const n = verts.length
          for (let i = 0; i < (closed ? n : n - 1); i++) {
            const a = verts[i], b = verts[(i + 1) % n]
            poly(bulgePts(a.x, a.y, b.x, b.y, a.b), xf)
          }
          break
        }
        case "POLYLINE": {
          layers.add(e.layer)
          const closed = (num(e, 70) & 1) === 1
          const verts: Array<{ x: number; y: number; b: number }> = []
          let j = k + 1
          for (; j < ents.length && ents[j].type !== "SEQEND"; j++) {
            if (ents[j].type === "VERTEX") verts.push({ x: num(ents[j], 10), y: num(ents[j], 20), b: num(ents[j], 42) })
          }
          k = j
          const n = verts.length
          for (let i = 0; i < (closed ? n : n - 1); i++) {
            const a = verts[i], b = verts[(i + 1) % n]
            poly(bulgePts(a.x, a.y, b.x, b.y, a.b), xf)
          }
          break
        }
        case "SOLID":
        case "3DFACE": {
          layers.add(e.layer)
          // порядок вершин SOLID: 1, 2, 4, 3
          const p = [[num(e, 10), num(e, 20)], [num(e, 11), num(e, 21)], [num(e, 13), num(e, 23)], [num(e, 12), num(e, 22)]] as Array<[number, number]>
          poly(e.type === "SOLID" ? [...p, p[0]] : [p[0], p[1], p[3], p[2], p[0]], xf)
          break
        }
        case "CIRCLE":
          layers.add(e.layer)
          poly(arcPts(num(e, 10), num(e, 20), num(e, 40), 0, Math.PI * 2), xf)
          break
        case "ARC":
          layers.add(e.layer)
          poly(arcPts(num(e, 10), num(e, 20), num(e, 40), (num(e, 50) * Math.PI) / 180, (num(e, 51) * Math.PI) / 180), xf)
          break
        case "ELLIPSE": {
          layers.add(e.layer)
          const cx = num(e, 10), cy = num(e, 20), mx = num(e, 11), my = num(e, 21), ratio = num(e, 40, 1)
          const t0 = num(e, 41, 0), t1 = num(e, 42, Math.PI * 2)
          const L = Math.hypot(mx, my), ang = Math.atan2(my, mx)
          let sweep = t1 - t0
          while (sweep <= 0) sweep += Math.PI * 2
          const pts: Array<[number, number]> = []
          for (let i = 0; i <= 48; i++) {
            const t = t0 + (sweep * i) / 48
            const px = L * Math.cos(t), py = L * ratio * Math.sin(t)
            pts.push([cx + px * Math.cos(ang) - py * Math.sin(ang), cy + px * Math.sin(ang) + py * Math.cos(ang)])
          }
          poly(pts, xf)
          break
        }
        case "SPLINE": {
          layers.add(e.layer)
          const xs = all(e, 10), ys = all(e, 20)
          const pts = xs.map((x, i) => [x, ys[i]] as [number, number])
          if (pts.length >= 2) poly(pts, xf)
          break
        }
        case "INSERT": {
          if (depth > 6) break
          const nameP = e.codes.find((x) => x[0] === 2)
          const blk = nameP ? blocks.get(nameP[1].trim()) : undefined
          if (!blk) break
          const ix = num(e, 10), iy = num(e, 20)
          const sx = num(e, 41, 1), sy = num(e, 42, 1)
          const rot = (num(e, 50) * Math.PI) / 180
          const cos = Math.cos(rot), sin = Math.sin(rot)
          const inner: Xf = (x, y) => {
            const lx = (x - blk.bx) * sx, ly = (y - blk.by) * sy
            return xf(ix + lx * cos - ly * sin, iy + lx * sin + ly * cos)
          }
          draw(blk.ents, inner, depth + 1, e.layer)
          break
        }
      }
    }
  }

  const es = sections.get("ENTITIES")
  let unit = UNITS[insunits] ?? 1
  if (es) draw(entities(ps, es[0], es[1]), (x, y) => [x, y], 0)

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [ax, ay, bx, by] of segs) {
    minX = Math.min(minX, ax, bx); maxX = Math.max(maxX, ax, bx)
    minY = Math.min(minY, ay, by); maxY = Math.max(maxY, ay, by)
  }
  if (!Number.isFinite(minX)) throw new Error("В DXF нет линий: ни LINE, ни полилиний, ни блоков")
  // без единиц: здание меньше 500 «единиц» в ширину — это метры, а не миллиметры
  if (!UNITS[insunits] && Math.max(maxX - minX, maxY - minY) < 500) unit = 1000
  const segments: Seg[] = unit === 1 ? segs : segs.map(([a, b, c, d]) => [a * unit, b * unit, c * unit, d * unit])
  return {
    segments,
    bounds: { minX: minX * unit, minY: minY * unit, maxX: maxX * unit, maxY: maxY * unit },
    unitToMm: unit,
    layers: [...layers].sort(),
  }
}
