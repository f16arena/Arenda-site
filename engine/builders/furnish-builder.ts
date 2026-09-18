// Автомебель этажа: берём расстановку из lib/builder/furnish и строим её теми же
// процедурными моделями, что и каталог. Меши сливаются по материалу — иначе
// сотня столов даёт сотни draw call'ов и сцена проседает на слабых картах.

import { Mesh, MeshBuilder, TransformNode, type Scene } from "@babylonjs/core"
import type { Floor } from "@/types/builder"
import type { FloorRoom } from "@/lib/builder/rooms"
import { furnishFloor } from "@/lib/builder/furnish"
import { ASSET_SIZES } from "@/lib/builder/asset-sizes"
import { buildObject } from "./object-builder"

const S = 0.001
/** Потолок по количеству предметов на этаж — защита от гигантских открытых планов. */
const MAX_ITEMS = 420
/** Что висит под потолком — преградой для обхода не считается. */
const CEILING_ASSETS = new Set(["ceiling_light", "spot", "led_strip", "hanging_plant", "projector", "ac"])

export function buildFurnish(floor: Floor, rooms: FloorRoom[], parent: TransformNode, scene: Scene): Mesh[] {
  const items = furnishFloor(floor, rooms).slice(0, MAX_ITEMS)
  if (!items.length) return []
  const root = new TransformNode(`furnish_${floor.id}`, scene)
  root.parent = parent
  const raw: Mesh[] = []
  // невидимые коробки-преграды: в режиме обхода человек не проходит сквозь стол.
  // Ставим их отдельно от видимой геометрии — слитые меши для столкновений
  // слишком тяжёлые (десятки тысяч треугольников на этаж).
  const colliders: Mesh[] = []
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
    const size = ASSET_SIZES[it.assetId]
    // Светильники преградой не делаем: их модель висит под потолком, а точка
    // установки — у пола, и коробка встала бы посреди комнаты на уровне колена.
    if (size && !CEILING_ASSETS.has(it.assetId) && size.h >= 300) {
      const box = MeshBuilder.CreateBox(`fzc_${it.id}`, { width: size.w * S * it.scale, depth: size.d * S * it.scale, height: Math.min(size.h, 1200) * S * it.scale }, scene)
      box.position.set(it.at.x * S, (it.y + Math.min(size.h, 1200) / 2) * S, it.at.y * S)
      box.rotation.y = it.rotationY
      box.parent = root
      box.isVisible = false
      box.isPickable = false
      box.checkCollisions = true
      box.metadata = { kind: "furnish-collider", floorId: floor.id }
      colliders.push(box)
    }
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
  return [...out, ...colliders]
}
