// Автомебель этажа: берём расстановку из lib/builder/furnish и строим её теми же
// процедурными моделями, что и каталог. Меши сливаются по материалу — иначе
// сотня столов даёт сотни draw call'ов и сцена проседает на слабых картах.

import { Mesh, TransformNode, type Scene } from "@babylonjs/core"
import type { Floor } from "@/types/builder"
import type { FloorRoom } from "@/lib/builder/rooms"
import { furnishFloor } from "@/lib/builder/furnish"
import { buildObject } from "./object-builder"

const S = 0.001
/** Потолок по количеству предметов на этаж — защита от гигантских открытых планов. */
const MAX_ITEMS = 420

export function buildFurnish(floor: Floor, rooms: FloorRoom[], parent: TransformNode, scene: Scene): Mesh[] {
  const items = furnishFloor(floor, rooms).slice(0, MAX_ITEMS)
  if (!items.length) return []
  const root = new TransformNode(`furnish_${floor.id}`, scene)
  root.parent = parent
  const raw: Mesh[] = []
  for (const it of items) {
    const node = buildObject(
      {
        id: `fz_${it.id}`,
        assetId: it.assetId,
        position: { x: it.at.x, y: it.y, z: it.at.y },
        rotationY: it.rotationY,
        scale: it.scale,
        attachTo: "floor",
        locked: true,
      },
      root,
      scene,
      floor.id,
    )
    for (const m of node.getChildMeshes()) if (m instanceof Mesh) raw.push(m)
  }
  // слияние по материалу: мировые матрицы «запекаются», поэтому снимаем с родителя
  const byMaterial = new Map<string, Mesh[]>()
  for (const m of raw) {
    m.isPickable = false
    const key = m.material?.name ?? "none"
    byMaterial.set(key, [...(byMaterial.get(key) ?? []), m])
  }
  const out: Mesh[] = []
  for (const [key, list] of byMaterial) {
    if (list.length === 1) { out.push(list[0]); continue }
    for (const m of list) m.setParent(null)
    const merged = Mesh.MergeMeshes(list, true, true, undefined, false, true)
    if (!merged) { out.push(...list); continue }
    merged.name = `furnish_${floor.id}_${key}`
    merged.setParent(root)
    merged.isPickable = false
    merged.receiveShadows = true
    merged.metadata = { kind: "furnish", floorId: floor.id }
    out.push(merged)
  }
  for (const m of out) {
    m.isPickable = false
    if (!m.metadata) m.metadata = { kind: "furnish", floorId: floor.id }
  }
  void S
  return out
}
