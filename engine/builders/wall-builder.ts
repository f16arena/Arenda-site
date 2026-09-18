// ADR: Стены этажа → коробки Babylon из рёбер графа. Фаза 2: реальные вырезы проёмов
// кусочной сборкой (простенки по wallProfile + перемычка над + подоконник под + стекло
// в окне) — дверь/окно НИКОГДА не «поверх» сплошной стены. Метаданные несут floorId/
// entityId для picking/выделения; проёмы — свои метаданные (kind=opening).

import { MeshBuilder, type Mesh, type Scene, type TransformNode } from "@babylonjs/core"
import type { Floor } from "@/types/builder"
import { wallProfile } from "@/core/geometry/wall-profile"
import { distance, normalize, sub, type Vec2 } from "@/core/geometry/math"
import type { MaterialRegistry } from "../material-registry"

const S = 0.001 // мм → м

interface BoxSpec {
  cx: number // мм мир
  cz: number
  yMid: number // мм
  width: number // вдоль стены, мм
  height: number // мм
  depth: number // мм
  angle: number // рад (Babylon Y)
}

function makeBox(spec: BoxSpec, scene: Scene, name: string): Mesh {
  const box = MeshBuilder.CreateBox(name, { width: spec.width * S, depth: spec.depth * S, height: spec.height * S }, scene)
  box.position.set(spec.cx * S, spec.yMid * S, spec.cz * S)
  box.rotation.y = spec.angle
  return box
}

export interface WallExtras {
  /** лёгкий режим: без откосов, подоконников, переплётов и ручек */
  lite?: boolean
  /** нижний этаж здания — у наружных стен цоколь */
  plinth?: boolean
  /** верхний этаж — карниз/парапет по наружным стенам */
  cornice?: boolean
}

export function buildWalls(floor: Floor, parent: TransformNode, scene: Scene, reg: MaterialRegistry, extras: WallExtras = {}): Mesh[] {
  const meshes: Mesh[] = []
  const g = floor.wallGraph
  // сколько стен сходится в узле — для стыков (как на чертеже)
  const degree = new Map<string, number>()
  for (const k in g.edges) {
    const e = g.edges[k]
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1)
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1)
  }
  for (const id in g.edges) {
    const e = g.edges[id]
    const a = g.nodes[e.a]
    const b = g.nodes[e.b]
    if (!a || !b) continue
    const aV: Vec2 = { x: a.x, y: a.y }
    const bV: Vec2 = { x: b.x, y: b.y }
    const lenMm = distance(aV, bV)
    if (lenMm < 1) continue
    const dir = normalize(sub(bV, aV))
    const nrm = { x: -dir.y, y: dir.x }
    const angle = -Math.atan2(dir.y, dir.x)
    const H = e.height
    const t = e.thickness
    // Стык: стена доходит до дальней грани той стены, в которую упирается, — угол
    // без щели и без торчащего конца (та же математика, что на чертеже). Продолжение
    // по прямой не продлеваем — иначе куски налезали бы друг на друга.
    const extAt = (nodeId: string): number => {
      if ((degree.get(nodeId) ?? 0) < 2) return 0
      let ext = 0
      for (const oid in g.edges) {
        if (oid === id) continue
        const o = g.edges[oid]
        if (o.a !== nodeId && o.b !== nodeId) continue
        const oa = g.nodes[o.a], ob = g.nodes[o.b]
        if (!oa || !ob) continue
        const ol = Math.hypot(ob.x - oa.x, ob.y - oa.y) || 1
        const cross = Math.abs(dir.x * ((ob.y - oa.y) / ol) - dir.y * ((ob.x - oa.x) / ol))
        if (cross < 0.1) continue
        // не доводим до самой грани: совпадающие плоскости мерцают и рисуют
        // на фасаде тонкие полосы
        ext = Math.max(ext, Math.max(0, o.thickness / 2 - 20))
      }
      return ext
    }
    const extA = extAt(e.a)
    const extB = extAt(e.b)
    const at = (off: number): Vec2 => ({ x: a.x + dir.x * off, y: a.y + dir.y * off })
    // перепланировка: демонтаж — красный полупрозрачный, новая — зелёная
    const wallMat = e.phase === "demolish" ? reg.status("#ef4444") : e.phase === "new" ? reg.status("#22c55e") : reg.get(e.kind === "exterior" ? e.facadeMaterialId ?? "plaster_white" : e.interiorMaterialId ?? "block")
    const ops = floor.openings.filter((o) => o.wallId === id).sort((p, q) => p.offset - q.offset)

    const pointAt = (off: number): { x: number; y: number } => ({ x: a.x + dir.x * off, y: a.y + dir.y * off })
    const midOf = (p: Vec2, q: Vec2) => ({ cx: (p.x + q.x) / 2, cz: (p.y + q.y) / 2 })

    const wallMeta = { kind: "wall", floorId: floor.id, entityId: id, phase: e.phase }
    const pushWall = (m: Mesh) => {
      m.material = wallMat
      m.receiveShadows = true
      m.metadata = wallMeta
      m.parent = parent
      meshes.push(m)
    }
    // цоколь и карниз — только по наружным стенам, по всей длине со стыками
    const band = (y0: number, h: number, extra: number, mat: ReturnType<MaterialRegistry["get"]>, name: string) => {
      const p0 = at(-extA), p1 = at(lenMm + extB)
      const box = makeBox({ cx: (p0.x + p1.x) / 2, cz: (p0.y + p1.y) / 2, yMid: y0 + h / 2, width: lenMm + extA + extB, height: h, depth: t + extra, angle }, scene, name)
      box.material = mat
      box.receiveShadows = true
      box.metadata = wallMeta
      box.parent = parent
      meshes.push(box)
    }
    if (e.kind === "exterior" && extras.plinth) band(0, 600, 120, reg.get("granite"), `plinth_${id}`)
    if (e.kind === "exterior" && extras.cornice) band(H - 260, 260, 180, reg.get(e.facadeMaterialId ?? "plaster_white"), `cornice_${id}`)

    if (ops.length === 0) {
      const p0 = at(-extA), p1 = at(lenMm + extB)
      pushWall(makeBox({ cx: (p0.x + p1.x) / 2, cz: (p0.y + p1.y) / 2, yMid: H / 2, width: lenMm + extA + extB, height: H, depth: t, angle }, scene, `wall_${id}`))
      continue
    }

    // Простенки на всю высоту между проёмами; крайние — до грани соседней стены
    const solids = wallProfile(aV, bV, ops.map((o) => ({ offset: o.offset, width: o.width })))
    solids.forEach((seg, i) => {
      const first = i === 0 && distance(aV, seg.a) < 1
      const last = i === solids.length - 1 && distance(bV, seg.b) < 1
      const p0 = first ? at(-extA) : seg.a
      const p1 = last ? at(lenMm + extB) : seg.b
      const segLen = distance(p0, p1)
      if (segLen < 1) return
      const m = midOf(p0, p1)
      pushWall(makeBox({ cx: m.cx, cz: m.cz, yMid: H / 2, width: segLen, height: H, depth: t, angle }, scene, `wall_${id}_s${i}`))
    })

    // Перемычка/подоконник/стекло у каждого проёма
    for (const o of ops) {
      const c = pointAt(o.offset)
      const top = o.sillHeight + o.height
      if (o.sillHeight > 1) {
        const below = makeBox({ cx: c.x, cz: c.y, yMid: o.sillHeight / 2, width: o.width, height: o.sillHeight, depth: t, angle }, scene, `sill_${o.id}`)
        below.material = wallMat
        below.receiveShadows = true
        below.metadata = { kind: "wall", floorId: floor.id, entityId: id, phase: e.phase }
        below.parent = parent
        meshes.push(below)
      }
      if (top < H - 1) {
        const above = makeBox({ cx: c.x, cz: c.y, yMid: (top + H) / 2, width: o.width, height: H - top, depth: t, angle }, scene, `lintel_${o.id}`)
        above.material = wallMat
        above.receiveShadows = true
        above.metadata = { kind: "wall", floorId: floor.id, entityId: id, phase: e.phase }
        above.parent = parent
        meshes.push(above)
      }
      const opMeta = { kind: "opening", floorId: floor.id, entityId: o.id }
      if (o.type === "door" && o.exit) {
        // знак над дверью с обеих сторон: зелёный «Выход» (эвакуационный), синий — главный вход
        const sign = makeBox({ cx: c.x, cz: c.y, yMid: Math.min(H - 120, o.height + 220), width: Math.min(600, o.width), height: 200, depth: t + 60, angle }, scene, `exit_${o.id}`)
        sign.material = reg.status(o.exit === "emergency" ? "#16a34a" : "#2563eb")
        sign.metadata = { kind: "opening", floorId: floor.id, entityId: o.id }
        sign.parent = parent
        meshes.push(sign)
      }
      const at = (lateral: number) => pointAt(o.offset + lateral)
      const push = (m: Mesh, mat: ReturnType<MaterialRegistry["get"]>) => {
        m.material = mat
        m.receiveShadows = true
        m.metadata = opMeta
        m.parent = parent
        meshes.push(m)
      }
      // откосы/наличник по краю проёма — проём читается, а не «дыра в коробке»
      if (o.variant !== "arch" && !extras.lite) {
        const jambMat = reg.get(o.type === "window" ? "plaster_white" : "paint_white")
        const top = o.sillHeight + o.height
        for (const side of [-1, 1]) {
          const cc = at((side * (o.width + 70)) / 2)
          const jamb = makeBox({ cx: cc.x, cz: cc.y, yMid: o.sillHeight + o.height / 2, width: 70, height: o.height, depth: t + 40, angle }, scene, `jamb_${o.id}_${side}`)
          push(jamb, jambMat)
        }
        const head = makeBox({ cx: c.x, cz: c.y, yMid: top + 35, width: o.width + 140, height: 70, depth: t + 40, angle }, scene, `head_${o.id}`)
        push(head, jambMat)
      }
      if (o.type === "window") {
        // подоконник внутри и отлив снаружи
        for (const s2 of extras.lite ? [] : [-1, 1]) {
          const cc = { x: c.x + nrm.x * s2 * (t / 2 + 60), y: c.y + nrm.y * s2 * (t / 2 + 60) }
          const sill = makeBox({ cx: cc.x, cz: cc.y, yMid: o.sillHeight - 25, width: o.width + 160, height: 50, depth: 180, angle }, scene, `sillb_${o.id}_${s2}`)
          push(sill, reg.get(s2 > 0 ? "marble" : "concrete"))
        }
        // стекло на весь проём + рама + переплёт (крест) для непанорамных
        // стекло утоплено внутрь: снаружи видна четверть и тень откоса
        const inset = { x: c.x - nrm.x * t * 0.18, y: c.y - nrm.y * t * 0.18 }
        const glass = makeBox({ cx: inset.x, cz: inset.y, yMid: o.sillHeight + o.height / 2, width: o.width - 60, height: o.height - 60, depth: t * 0.12, angle }, scene, `glass_${o.id}`)
        push(glass, reg.get("glass"))
        if (o.variant !== "panoramic" && !extras.lite) {
          const mull = makeBox({ cx: inset.x, cz: inset.y, yMid: o.sillHeight + o.height / 2, width: 70, height: o.height - 60, depth: t * 0.2, angle }, scene, `mv_${o.id}`)
          push(mull, reg.get("plaster_white"))
          const mh = makeBox({ cx: inset.x, cz: inset.y, yMid: o.sillHeight + o.height / 2, width: o.width - 60, height: 70, depth: t * 0.2, angle }, scene, `mh_${o.id}`)
          push(mh, reg.get("plaster_white"))
          // рама по периметру створки — окно читается и вблизи, и с фасада
          for (const [dx, dy, w2, h2] of [[0, (o.height - 60) / 2, o.width - 60, 80], [0, -(o.height - 60) / 2, o.width - 60, 80]] as const) {
            const fr = makeBox({ cx: inset.x, cz: inset.y, yMid: o.sillHeight + o.height / 2 + dy, width: w2, height: h2, depth: t * 0.2, angle }, scene, `wf_${o.id}_${dy}`)
            void dx
            push(fr, reg.get("plaster_white"))
          }
        }
      } else {
        // двери — створки по варианту
        const leafD = t * 0.35
        const doorMat = reg.get("laminate")
        if (o.variant === "double") {
          const lw = o.width / 2 - 40
          for (const side of [-1, 1]) {
            const cc = at((side * o.width) / 4)
            const leaf = makeBox({ cx: cc.x, cz: cc.y, yMid: o.height / 2, width: lw, height: o.height - 40, depth: leafD, angle }, scene, `dl_${o.id}_${side}`)
            push(leaf, doorMat)
          }
        } else if (o.variant === "sliding") {
          const cc = at(-o.width / 4)
          const leaf = makeBox({ cx: cc.x, cz: cc.y, yMid: o.height / 2, width: o.width / 2, height: o.height - 40, depth: leafD, angle }, scene, `ds_${o.id}`)
          push(leaf, reg.get("glass"))
          const rail = makeBox({ cx: c.x, cz: c.y, yMid: o.height - 20, width: o.width, height: 60, depth: leafD, angle }, scene, `dr_${o.id}`)
          push(rail, reg.get("concrete"))
        } else if (o.variant === "arch") {
          // арочный проём без полотна: полукруглый верх — стена заполняет углы над дугой
          const r = o.width / 2
          const spring = Math.max(o.height - r, 0)
          const n = 14
          for (let i = 0; i < n; i++) {
            const x0 = -r + (2 * r * i) / n, x1 = -r + (2 * r * (i + 1)) / n
            const xm = Math.max(Math.abs(x0), Math.abs(x1)) // внешний край полоски — чтобы дуга не «зубилась» внутрь
            const arcY = spring + Math.sqrt(Math.max(0, r * r - xm * xm))
            const hFill = o.height - arcY
            if (hFill < 5) continue
            const cc = at((x0 + x1) / 2)
            const fill = makeBox({ cx: cc.x, cz: cc.y, yMid: arcY + hFill / 2, width: x1 - x0 + 2, height: hFill, depth: t, angle }, scene, `arch_${o.id}_${i}`)
            fill.material = wallMat
            fill.receiveShadows = true
            fill.metadata = { kind: "wall", floorId: floor.id, entityId: id, phase: e.phase }
            fill.parent = parent
            meshes.push(fill)
          }
        } else if (o.variant === "garage") {
          for (let s = 0; s < 5; s++) {
            const seg = makeBox({ cx: c.x, cz: c.y, yMid: 130 + s * ((o.height - 80) / 5), width: o.width - 40, height: (o.height - 80) / 5 - 20, depth: leafD, angle }, scene, `dg_${o.id}_${s}`)
            push(seg, reg.get("metal_roof"))
          }
        } else {
          const leaf = makeBox({ cx: c.x, cz: c.y, yMid: o.height / 2, width: o.width - 60, height: o.height - 40, depth: leafD, angle }, scene, `dl_${o.id}`)
          push(leaf, doorMat)
          // ручка с двух сторон — по ней видно, что это дверь, а не щит
          for (const s2 of extras.lite ? [] : [-1, 1]) {
            const hc = at(o.width / 2 - 120)
            const knob = makeBox({ cx: hc.x + nrm.x * s2 * (leafD / 2 + 25), cz: hc.y + nrm.y * s2 * (leafD / 2 + 25), yMid: 1050, width: 120, height: 34, depth: 50, angle }, scene, `dk_${o.id}_${s2}`)
            push(knob, reg.get("metal_roof"))
          }
        }
      }
    }
  }
  return meshes
}
