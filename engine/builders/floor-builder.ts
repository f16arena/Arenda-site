// ADR: Полы — производные от комнат (detectRooms). Полигон комнаты → плоский меш
// (MeshBuilder.CreatePolygon + earcut, двусторонний). Привязанные к premise комнаты
// получают полупрозрачный overlay цвета статуса (§7). Метаданные несут площадь.

import { MeshBuilder, Mesh, Vector3, type Scene, type TransformNode } from "@babylonjs/core"
import earcut from "earcut"
import type { Floor } from "@/types/builder"
import { detectRooms } from "@/core/geometry/room-detection"
import { centroid, pointInPolygon, type Vec2 } from "@/core/geometry/math"
import { STATUS_COLOR, type PremiseStatus } from "@/lib/builder/materials"
import type { MaterialRegistry } from "../material-registry"

const S = 0.001

export type StatusResolver = (premiseId: string) => PremiseStatus | undefined

export function buildFloors(
  floor: Floor,
  parent: TransformNode,
  scene: Scene,
  reg: MaterialRegistry,
  statusResolver: StatusResolver,
  holes: Vec2[][] = [],
): Mesh[] {
  const meshes: Mesh[] = []
  const rooms = detectRooms(floor.wallGraph)
  for (const room of rooms) {
    const shape = room.polygon.map((p) => new Vector3(p.x * S, 0, p.y * S))
    // Вырезы (лестницы), чей центр лежит внутри комнаты.
    const roomHoles = holes.filter((h) => h.length >= 3 && pointInPolygon(centroid(h), room.polygon))
    const holeShapes = roomHoles.map((h) => h.map((p) => new Vector3(p.x * S, 0, p.y * S)))
    const slab = MeshBuilder.CreatePolygon(
      `floor_${floor.id}_${room.id}`,
      { shape, holes: holeShapes.length ? holeShapes : undefined, sideOrientation: Mesh.DOUBLESIDE },
      scene,
      earcut,
    )
    slab.position.y = 0.02
    slab.parent = parent
    slab.receiveShadows = true
    slab.material = reg.get(floor.roomMaterials[room.id] ?? floor.floorMaterialId ?? "laminate")
    slab.metadata = { kind: "room", floorId: floor.id, entityId: room.id, areaMm2: room.areaMm2 }
    meshes.push(slab)

    const premiseId = floor.premiseLinks[room.id]
    if (premiseId) {
      const status = statusResolver(premiseId)
      if (status) {
        const overlay = MeshBuilder.CreatePolygon(
          `status_${floor.id}_${room.id}`,
          { shape, sideOrientation: Mesh.DOUBLESIDE },
          scene,
          earcut,
        )
        overlay.position.y = 0.05
        overlay.parent = parent
        overlay.isPickable = false
        overlay.material = reg.status(STATUS_COLOR[status])
        overlay.metadata = { kind: "status", floorId: floor.id, entityId: room.id }
        meshes.push(overlay)
      }
    }
  }
  return meshes
}
