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
      if (o.type === "window") {
        const glass = makeBox({ cx: c.x, cz: c.y, yMid: o.sillHeight + o.height / 2, width: o.width, height: o.height, depth: t * 0.2, angle }, scene, `glass_${o.id}`)
        glass.material = reg.get("glass")
        glass.metadata = { kind: "opening", floorId: floor.id, entityId: o.id }
        glass.parent = parent
        meshes.push(glass)
      } else {
        // дверь — отметим невидимым тонким пикабельным маркером в проёме для выделения
        const marker = makeBox({ cx: c.x, cz: c.y, yMid: o.height / 2, width: o.width, height: o.height, depth: t * 0.15, angle }, scene, `door_${o.id}`)
        marker.visibility = 0.12
        marker.material = reg.get("laminate")
        marker.metadata = { kind: "opening", floorId: floor.id, entityId: o.id }
        marker.parent = parent
        meshes.push(marker)
      }
    }
  }
  return meshes
}
