// ADR: Стены этажа → коробки Babylon из рёбер графа. Фаза 1 — сплошные стены без
// проёмов и miter (Фаза 2). Метаданные несут floorId/entityId для picking и выделения.

import { MeshBuilder, type Mesh, type Scene, type TransformNode } from "@babylonjs/core"
import type { Floor } from "@/types/builder"
import type { MaterialRegistry } from "../material-registry"

const S = 0.001 // мм → м

export function buildWalls(floor: Floor, parent: TransformNode, scene: Scene, reg: MaterialRegistry): Mesh[] {
  const meshes: Mesh[] = []
  const g = floor.wallGraph
  for (const id in g.edges) {
    const e = g.edges[id]
    const a = g.nodes[e.a]
    const b = g.nodes[e.b]
    if (!a || !b) continue
    const ax = a.x * S
    const az = a.y * S
    const bx = b.x * S
    const bz = b.y * S
    const dx = bx - ax
    const dz = bz - az
    const len = Math.hypot(dx, dz)
    if (len < 0.001) continue
    const h = e.height * S
    const box = MeshBuilder.CreateBox(`wall_${id}`, { width: len, depth: e.thickness * S, height: h }, scene)
    box.position.set((ax + bx) / 2, h / 2, (az + bz) / 2)
    box.rotation.y = -Math.atan2(dz, dx)
    box.material = reg.get(
      e.kind === "exterior" ? e.facadeMaterialId ?? "plaster_white" : e.interiorMaterialId ?? "block",
    )
    box.parent = parent
    box.receiveShadows = true
    box.metadata = { kind: "wall", floorId: floor.id, entityId: id }
    meshes.push(box)
  }
  return meshes
}
