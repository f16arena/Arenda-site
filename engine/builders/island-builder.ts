// Островок в 3D: арендное место посреди общей зоны — вендинговый автомат, киоск,
// банкомат, стойка. Геометрия нарочно простая (корпус + витрина + цоколь): это
// не мебель для красоты, а объём, по которому видно, сколько места точка съедает
// в коридоре и не перекрывает ли она проход.

import { MeshBuilder, TransformNode, type Mesh, type Scene } from "@babylonjs/core"
import type { Island } from "@/types/builder"
import type { MaterialRegistry } from "../material-registry"
import { isWallMounted, mountHeight } from "@/lib/builder/islands"

const S = 0.001

/** Материалы корпуса и «стекла» по виду места. */
const LOOK: Record<Island["kind"], { body: string; front: string; plinth: boolean }> = {
  vending: { body: "paint_graphite", front: "curtain_glass", plinth: false },
  kiosk: { body: "composite", front: "curtain_glass", plinth: true },
  atm: { body: "paint_graphite", front: "paint_black", plinth: false },
  counter: { body: "wood_panel", front: "wood_panel_light", plinth: true },
  coffee: { body: "paint_terra", front: "wood_panel", plinth: true },
  rack: { body: "paint_white", front: "curtain_glass", plinth: false },
  banner: { body: "paint_white", front: "composite", plinth: false },
  lightbox: { body: "paint_white", front: "curtain_glass", plinth: false },
  other: { body: "paint_gray", front: "paint_gray", plinth: false },
}

export function buildIsland(island: Island, parent: TransformNode, scene: Scene, reg: MaterialRegistry, lite = false): TransformNode {
  const look = LOOK[island.kind] ?? LOOK.other
  const wall = isWallMounted(island)
  const root = new TransformNode(`island_${island.id}`, scene)
  root.parent = parent
  root.position.set(island.position.x * S, 0, island.position.y * S)
  root.rotation.y = (island.rotationDeg * Math.PI) / 180
  const meta = { kind: "island", floorId: "", entityId: island.id }

  const w = island.width * S
  const d = island.depth * S
  const h = island.height * S
  const attach = (m: Mesh, mat: string) => {
    m.parent = root
    m.material = reg.get(mat)
    m.receiveShadows = true
    m.metadata = meta
    m.checkCollisions = true
  }

  // корпус: чуть уже габарита, чтобы витрина и вывеска выступали своими плоскостями
  const y0 = mountHeight(island) * S
  const body = MeshBuilder.CreateBox(`isl_body_${island.id}`, { width: w, height: h, depth: d }, scene)
  body.position.set(0, y0 + h / 2, 0)
  attach(body, look.body)

  if (lite) return root

  // лицевая панель (витрина/экран): передняя сторона по локальной −Z
  const faceH = island.kind === "counter" ? h * 0.45 : wall ? h * 0.92 : h * 0.62
  const faceY = y0 + (island.kind === "counter" ? h * 0.72 : wall ? h / 2 : h * 0.55)
  const face = MeshBuilder.CreateBox(`isl_face_${island.id}`, { width: w * (wall ? 0.96 : 0.86), height: faceH, depth: 0.03 }, scene)
  face.position.set(0, faceY, -d / 2 - 0.016)
  attach(face, look.front)

  // цоколь: киоск и стойка стоят на подиуме, автомат — прямо на полу
  // у рекламы на стене нет ни цоколя, ни вывески — она сама вывеска
  if (wall) return root

  if (look.plinth) {
    const plinth = MeshBuilder.CreateBox(`isl_plinth_${island.id}`, { width: w + 0.12, height: 0.1, depth: d + 0.12 }, scene)
    plinth.position.set(0, 0.05, 0)
    attach(plinth, "concrete_polished")
  }

  // вывеска сверху: по ней место видно издалека в обходе
  const sign = MeshBuilder.CreateBox(`isl_sign_${island.id}`, { width: w * 0.9, height: 0.18, depth: 0.05 }, scene)
  sign.position.set(0, y0 + h + 0.12, -d / 2)
  attach(sign, island.tenant ? "paint_blue" : "paint_gray")

  return root
}
