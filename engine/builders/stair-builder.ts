// ADR: Лестница → группа коробок-ступеней (+ перила) из StairGeometry ядра. Крепится
// к узлу этажа (origin = position лестницы, поворот rotationDeg). Вырез в перекрытии
// выше делает floor-builder (hole), геометрию которого считает движок при пересборке.

import { MeshBuilder, TransformNode, type Mesh, type Scene } from "@babylonjs/core"
import type { Stair } from "@/types/builder"
import { generateStair, type StairShape } from "@/core/geometry/stair-generator"
import type { MaterialRegistry } from "../material-registry"

const S = 0.001

export function buildStair(stair: Stair, floorHeight: number, parent: TransformNode, scene: Scene, reg: MaterialRegistry): TransformNode {
  const geo = generateStair(stair.shape as StairShape, floorHeight, stair.width, stair.railing)
  const root = new TransformNode(`stair_${stair.id}`, scene)
  root.parent = parent
  root.position.set(stair.position.x * S, 0, stair.position.y * S)
  root.rotation.y = (stair.rotationDeg * Math.PI) / 180
  const mat = reg.get("concrete")
  const railMat = reg.get("metal_roof")
  const meta = { kind: "stair", floorId: stair.fromFloorId, entityId: stair.id }
  // Зеркало по локальной X: переносим позиции (геометрия/нормали целы, без отрицательного scale).
  const mx = stair.mirror ? -1 : 1
  const place = (b: { x: number; y: number; z: number; w: number; h: number; d: number }, m: Mesh) => {
    m.position.set(b.x * mx * S, b.y * S, b.z * S)
    m.parent = root
    m.receiveShadows = true
    m.metadata = meta
  }
  for (let i = 0; i < geo.steps.length; i++) {
    const b = geo.steps[i]
    const box = MeshBuilder.CreateBox(`step_${stair.id}_${i}`, { width: b.w * S, height: b.h * S, depth: b.d * S }, scene)
    box.material = mat
    place(b, box)
  }
  for (let i = 0; i < geo.rails.length; i++) {
    const b = geo.rails[i]
    const box = MeshBuilder.CreateBox(`rail_${stair.id}_${i}`, { width: b.w * S, height: b.h * S, depth: b.d * S }, scene)
    box.material = railMat
    place(b, box)
  }
  return root
}

/** Прямоугольник выреза в перекрытии выше — в мировых мм плоскости этажа. */
export function stairHoleWorld(stair: Stair, floorHeight: number): { x: number; y: number }[] {
  const geo = generateStair(stair.shape as StairShape, floorHeight, stair.width, stair.railing)
  const corners = [
    { x: geo.hole.minX, z: geo.hole.minZ },
    { x: geo.hole.maxX, z: geo.hole.minZ },
    { x: geo.hole.maxX, z: geo.hole.maxZ },
    { x: geo.hole.minX, z: geo.hole.maxZ },
  ]
  const rot = (stair.rotationDeg * Math.PI) / 180
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const mx = stair.mirror ? -1 : 1
  // Зеркало по X (как в buildStair) → поворот вокруг origin + смещение position.
  return corners.map((c) => {
    const cx = c.x * mx
    return {
      x: stair.position.x + (cx * cos + c.z * sin),
      y: stair.position.y + (-cx * sin + c.z * cos),
    }
  })
}
