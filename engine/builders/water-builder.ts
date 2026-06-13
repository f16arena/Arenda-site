// ADR: Водоём по контуру (вода по сплайну, §v4). Контур-полигон в мм → плоский
// полупрозрачный меш воды (MeshBuilder.CreatePolygon + earcut) у поверхности земли.
// Прокоп русла делает движок (опускает heightmap внутри контура), здесь — только
// зеркало воды. Меш pickable (kind:"water") для выбора/удаления.

import { MeshBuilder, Mesh, Vector3, type Scene, type TransformNode } from "@babylonjs/core"
import earcut from "earcut"
import type { WaterBody } from "@/types/builder"
import type { MaterialRegistry } from "../material-registry"

const S = 0.001

export function buildWater(body: WaterBody, parent: TransformNode, scene: Scene, reg: MaterialRegistry): Mesh | null {
  if (body.points.length < 3) return null
  const shape = body.points.map((p) => new Vector3(p.x * S, 0, p.y * S))
  const surface = MeshBuilder.CreatePolygon(
    `water_${body.id}`,
    { shape, sideOrientation: Mesh.DOUBLESIDE },
    scene,
    earcut,
  )
  // Зеркало чуть ниже нулевой отметки газона, чтобы было видно «налитую» воду.
  surface.position.y = -0.06
  surface.parent = parent
  surface.material = reg.water()
  surface.isPickable = true
  surface.metadata = { kind: "water", entityId: body.id }
  return surface
}
