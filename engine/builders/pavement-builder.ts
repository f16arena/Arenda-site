// ADR: Площадка-покрытие по контуру (§v4). Замкнутый полигон точек (мм) → плоский меш
// (MeshBuilder.CreatePolygon + earcut) выше светящейся сетки, залитый одним материалом —
// один цельный кусок без швов (двор/парковка/газон). Pickable (kind:"pavement").

import { MeshBuilder, Mesh, Vector3, type Scene, type TransformNode } from "@babylonjs/core"
import earcut from "earcut"
import type { Pavement } from "@/types/builder"
import type { MaterialRegistry } from "../material-registry"

const S = 0.001

export function buildPavement(pav: Pavement, parent: TransformNode, scene: Scene, reg: MaterialRegistry): Mesh | null {
  if (pav.points.length < 3) return null
  const shape = pav.points.map((p) => new Vector3(p.x * S, 0, p.y * S))
  const surface = MeshBuilder.CreatePolygon(
    `pave_${pav.id}`,
    { shape, sideOrientation: Mesh.DOUBLESIDE },
    scene,
    earcut,
  )
  // Выше сетки (y=0.06), чтобы её линии не просвечивали сквозь покрытие.
  surface.position.y = 0.08
  surface.parent = parent
  surface.receiveShadows = true
  surface.material = reg.get(pav.materialId)
  surface.isPickable = true
  surface.metadata = { kind: "pavement", entityId: pav.id }
  return surface
}
