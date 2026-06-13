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

export function buildWalls(floor: Floor, parent: TransformNode, scene: Scene, reg: MaterialRegistry): Mesh[] {
  const meshes: Mesh[] = []
  const g = floor.wallGraph
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
    const angle = -Math.atan2(dir.y, dir.x)
    const H = e.height
    const t = e.thickness
    const wallMat = reg.get(e.kind === "exterior" ? e.facadeMaterialId ?? "plaster_white" : e.interiorMaterialId ?? "block")
    const ops = floor.openings.filter((o) => o.wallId === id).sort((p, q) => p.offset - q.offset)

    const pointAt = (off: number): { x: number; y: number } => ({ x: a.x + dir.x * off, y: a.y + dir.y * off })
    const midOf = (p: Vec2, q: Vec2) => ({ cx: (p.x + q.x) / 2, cz: (p.y + q.y) / 2 })

    if (ops.length === 0) {
      const box = makeBox({ cx: (a.x + b.x) / 2, cz: (a.y + b.y) / 2, yMid: H / 2, width: lenMm, height: H, depth: t, angle }, scene, `wall_${id}`)
      box.material = wallMat
      box.receiveShadows = true
      box.metadata = { kind: "wall", floorId: floor.id, entityId: id }
      box.parent = parent
      meshes.push(box)
      continue
    }

    // Простенки на всю высоту между проёмами
    const solids = wallProfile(aV, bV, ops.map((o) => ({ offset: o.offset, width: o.width })))
    solids.forEach((seg, i) => {
      const segLen = distance(seg.a, seg.b)
      if (segLen < 1) return
      const m = midOf(seg.a, seg.b)
      const box = makeBox({ cx: m.cx, cz: m.cz, yMid: H / 2, width: segLen, height: H, depth: t, angle }, scene, `wall_${id}_s${i}`)
      box.material = wallMat
      box.receiveShadows = true
      box.metadata = { kind: "wall", floorId: floor.id, entityId: id }
      box.parent = parent
      meshes.push(box)
    })

    // Перемычка/подоконник/стекло у каждого проёма
    for (const o of ops) {
      const c = pointAt(o.offset)
      const top = o.sillHeight + o.height
      if (o.sillHeight > 1) {
        const below = makeBox({ cx: c.x, cz: c.y, yMid: o.sillHeight / 2, width: o.width, height: o.sillHeight, depth: t, angle }, scene, `sill_${o.id}`)
        below.material = wallMat
        below.receiveShadows = true
        below.metadata = { kind: "wall", floorId: floor.id, entityId: id }
        below.parent = parent
        meshes.push(below)
      }
      if (top < H - 1) {
        const above = makeBox({ cx: c.x, cz: c.y, yMid: (top + H) / 2, width: o.width, height: H - top, depth: t, angle }, scene, `lintel_${o.id}`)
        above.material = wallMat
        above.receiveShadows = true
        above.metadata = { kind: "wall", floorId: floor.id, entityId: id }
        above.parent = parent
        meshes.push(above)
      }
      const opMeta = { kind: "opening", floorId: floor.id, entityId: o.id }
      const at = (lateral: number) => pointAt(o.offset + lateral)
      const push = (m: Mesh, mat: ReturnType<MaterialRegistry["get"]>) => {
        m.material = mat
        m.receiveShadows = true
        m.metadata = opMeta
        m.parent = parent
        meshes.push(m)
      }
      if (o.type === "window") {
        // стекло на весь проём + рама + переплёт (крест) для непанорамных
        const glass = makeBox({ cx: c.x, cz: c.y, yMid: o.sillHeight + o.height / 2, width: o.width - 60, height: o.height - 60, depth: t * 0.15, angle }, scene, `glass_${o.id}`)
        push(glass, reg.get("glass"))
        if (o.variant !== "panoramic") {
          const mull = makeBox({ cx: c.x, cz: c.y, yMid: o.sillHeight + o.height / 2, width: 60, height: o.height - 60, depth: t * 0.22, angle }, scene, `mv_${o.id}`)
          push(mull, reg.get("plaster_white"))
          const mh = makeBox({ cx: c.x, cz: c.y, yMid: o.sillHeight + o.height / 2, width: o.width - 60, height: 60, depth: t * 0.22, angle }, scene, `mh_${o.id}`)
          push(mh, reg.get("plaster_white"))
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
        } else if (o.variant === "garage") {
          for (let s = 0; s < 5; s++) {
            const seg = makeBox({ cx: c.x, cz: c.y, yMid: 130 + s * ((o.height - 80) / 5), width: o.width - 40, height: (o.height - 80) / 5 - 20, depth: leafD, angle }, scene, `dg_${o.id}_${s}`)
            push(seg, reg.get("metal_roof"))
          }
        } else {
          const leaf = makeBox({ cx: c.x, cz: c.y, yMid: o.height / 2, width: o.width - 60, height: o.height - 40, depth: leafD, angle }, scene, `dl_${o.id}`)
          push(leaf, doorMat)
        }
      }
    }
  }
  return meshes
}
