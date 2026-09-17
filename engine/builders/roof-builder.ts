// ADR: Кровля → меш из RoofMesh ядра (generateRoof). Позиции уже в абсолютных
// координатах здания [x,yUp,z] мм; крепится к building root (y=0), не к этажу.

import { Mesh, MeshBuilder, VertexData, type Scene, type TransformNode } from "@babylonjs/core"
import type { Floor } from "@/types/builder"
import { generateRoof } from "@/core/geometry/roof-generator"
import type { WallGraph } from "@/core/geometry/wall-graph"
import type { MaterialRegistry } from "../material-registry"

const S = 0.001

function footprintRect(g: WallGraph): { x: number; y: number }[] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const id in g.nodes) {
    const n = g.nodes[id]
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.x > maxX) maxX = n.x
    if (n.y > maxY) maxY = n.y
  }
  if (!isFinite(minX)) return []
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]
}

export function buildRoof(floor: Floor, parent: TransformNode, scene: Scene, reg: MaterialRegistry): Mesh | null {
  if (!floor.roof) return null
  const footprint = footprintRect(floor.wallGraph)
  if (footprint.length < 3) return null
  const yBase = floor.elevation + floor.height // верх стен этажа, мм
  const roof = generateRoof(footprint, yBase, floor.roof)
  if (roof.positions.length === 0) return null

  const mesh = new Mesh(`roof_${floor.id}`, scene)
  const positions = new Array<number>(roof.positions.length)
  for (let i = 0; i < roof.positions.length; i++) positions[i] = roof.positions[i] * S
  const vd = new VertexData()
  vd.positions = positions
  vd.indices = roof.indices
  const normals: number[] = []
  VertexData.ComputeNormals(positions, roof.indices, normals)
  vd.normals = normals
  vd.applyToMesh(mesh)
  mesh.material = reg.get(floor.roof.materialId ?? "metal_roof")
  mesh.parent = parent
  mesh.receiveShadows = true
  mesh.metadata = { kind: "roof", floorId: floor.id, entityId: `roof_${floor.id}` }

  // Плоская кровля без парапета выглядит «срезанной коробкой»: ставим бортик
  // 600 мм по контуру, как на настоящем здании.
  if (floor.roof.type === "flat") {
    const H = 600, T = 250
    const top = yBase + (floor.roof.thickness ?? 200)
    for (let i = 0; i < footprint.length; i++) {
      const a = footprint[i], b = footprint[(i + 1) % footprint.length]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 100) continue
      const box = MeshBuilder.CreateBox(`parapet_${floor.id}_${i}`, { width: (len + T) * S, height: H * S, depth: T * S }, scene)
      box.position.set(((a.x + b.x) / 2) * S, (top + H / 2) * S, ((a.y + b.y) / 2) * S)
      box.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x)
      box.material = reg.get("plaster_white")
      box.receiveShadows = true
      // бортик — украшение: клики сквозь него попадают в стены этажа
      box.isPickable = false
      box.parent = parent
      box.metadata = { kind: "roof", floorId: floor.id, entityId: `roof_${floor.id}` }
    }
  }
  return mesh
}
