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
import { roomDisplayName, roomUse } from "@/lib/builder/room-use"

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
    // + вложенные помещения (остров санузлов в коридоре) — иначе полы накладываются
    const roomHoles = [...holes.filter((h) => h.length >= 3 && pointInPolygon(centroid(h), room.polygon)), ...(room.holes ?? [])]
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
    slab.material = reg.get(floor.roomMaterials[room.id] ?? defaultFloorMaterial(floor, room) ?? floor.floorMaterialId ?? "laminate")
    slab.metadata = { kind: "room", floorId: floor.id, entityId: room.id, areaMm2: room.areaMm2 }
    meshes.push(slab)

    // потолок для этажа снизу: низ перекрытия белый, а не «паркет на потолке»
    const ceil = MeshBuilder.CreatePolygon(
      `ceil_${floor.id}_${room.id}`,
      { shape, holes: holeShapes.length ? holeShapes : undefined, sideOrientation: Mesh.DOUBLESIDE },
      scene,
      earcut,
    )
    ceil.position.y = -0.04
    ceil.parent = parent
    ceil.isPickable = false
    ceil.material = reg.get("paint_white")
    ceil.metadata = { kind: "room", floorId: floor.id, entityId: room.id, areaMm2: room.areaMm2 }
    meshes.push(ceil)

    // плинтус по периметру: комната перестаёт выглядеть картонной коробкой
    const ring = room.polygon
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 300) continue
      const skirt = MeshBuilder.CreateBox(`skirt_${floor.id}_${room.id}_${i}`, { width: len * S, height: 0.08, depth: 0.02 }, scene)
      skirt.position.set(((a.x + b.x) / 2) * S, 0.06, ((a.y + b.y) / 2) * S)
      skirt.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x)
      skirt.material = reg.get("paint_white")
      skirt.isPickable = false
      skirt.parent = parent
      skirt.metadata = { kind: "room", floorId: floor.id, entityId: room.id, areaMm2: room.areaMm2 }
      meshes.push(skirt)
    }

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

/** Пол по назначению, пока не выбран вручную: МОП — керамогранит, санузлы — плитка, техн. — наливной. */
function defaultFloorMaterial(floor: Floor, room: { id: string; polygon: Vec2[] }): string | undefined {
  const use = roomUse(floor, room)
  if (use === "rent") return undefined
  if (use === "tech") return "epoxy"
  return /санузел|с\/у|туалет|уборн|wc/i.test(roomDisplayName(floor, room)) ? "tile_white" : "granite_beige"
}
