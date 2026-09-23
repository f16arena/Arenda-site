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
import { offsetLoop } from "@/lib/builder/rooms"

const S = 0.001

export type StatusResolver = (premiseId: string) => PremiseStatus | undefined

export function buildFloors(
  floor: Floor,
  parent: TransformNode,
  scene: Scene,
  reg: MaterialRegistry,
  statusResolver: StatusResolver,
  holes: Vec2[][] = [],
  lite = false,
): Mesh[] {
  const meshes: Mesh[] = []
  // отделка и плинтусы: сотни одинаковых коробок — сливаем в один меш на материал,
  // иначе на слабом компьютере это сотни лишних вызовов отрисовки
  const decor: Mesh[] = []
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

    // Отделка стен помещения: тонкие панели по внутренней грани. Одна коробка
    // стены не может быть одновременно фасадом снаружи и краской внутри, поэтому
    // изнутри добавляем слой отделки. Проёмы вырезаются: иначе панель закрывала
    // бы двери и окна.
    const finish = reg.get(wallFinishMaterial(floor, room))
    if (lite) { /* лёгкий режим: без отделки и плинтусов */ } else {
    const ringFinish = offsetLoop(floor.wallGraph, room.nodeLoop, room.polygon, 1)
    for (let i = 0; i < ringFinish.length; i++) {
      const p0 = ringFinish[i], p1 = ringFinish[(i + 1) % ringFinish.length]
      const na = room.nodeLoop[i], nb = room.nodeLoop[(i + 1) % room.nodeLoop.length]
      const edgeId = Object.keys(floor.wallGraph.edges).find((id) => {
        const e = floor.wallGraph.edges[id]
        return (e.a === na && e.b === nb) || (e.a === nb && e.b === na)
      })
      const e = edgeId ? floor.wallGraph.edges[edgeId] : undefined
      const wa = e ? floor.wallGraph.nodes[e.a] : undefined
      const wb = e ? floor.wallGraph.nodes[e.b] : undefined
      if (!e || !wa || !wb) continue
      const L = Math.hypot(wb.x - wa.x, wb.y - wa.y)
      if (L < 1) continue
      const u = { x: (wb.x - wa.x) / L, y: (wb.y - wa.y) / L }
      const nrm = { x: -u.y, y: u.x }
      const proj = (p: Vec2) => (p.x - wa.x) * u.x + (p.y - wa.y) * u.y
      const off = (p: Vec2) => (p.x - wa.x) * nrm.x + (p.y - wa.y) * nrm.y
      const t0 = Math.min(proj(p0), proj(p1))
      const t1 = Math.max(proj(p0), proj(p1))
      const d = (off(p0) + off(p1)) / 2
      const ops = floor.openings
        .filter((o) => o.wallId === edgeId)
        .map((o) => ({ s0: o.offset - o.width / 2, s1: o.offset + o.width / 2, top: o.sillHeight + o.height }))
        .sort((x, y) => x.s0 - y.s0)
      const H = floor.height - 120
      const piece = (c0: number, c1: number, yBottom: number, h: number, key: string) => {
        const len = c1 - c0
        if (len < 250 || h < 120) return
        const cx = wa.x + u.x * ((c0 + c1) / 2) + nrm.x * d
        const cz = wa.y + u.y * ((c0 + c1) / 2) + nrm.y * d
        const panel = MeshBuilder.CreateBox(`finish_${floor.id}_${room.id}_${key}`, { width: len * S, height: h * S, depth: 0.02 }, scene)
        panel.position.set(cx * S, (yBottom + h / 2) * S, cz * S)
        panel.rotation.y = -Math.atan2(u.y, u.x)
        panel.material = finish
        panel.receiveShadows = true
        panel.isPickable = false
        panel.parent = parent
        panel.metadata = { kind: "room", floorId: floor.id, entityId: room.id, areaMm2: room.areaMm2 }
        decor.push(panel)
      }
      // простенки между проёмами — во всю высоту, над проёмом — до потолка
      let cur = t0
      for (const o of ops) {
        const s0 = Math.max(t0, o.s0), s1 = Math.min(t1, o.s1)
        if (s1 <= t0 || s0 >= t1) continue
        piece(cur, s0, 60, H, `${i}_${Math.round(s0)}`)
        if (o.top < floor.height - 180) piece(s0, s1, o.top + 40, floor.height - 120 - o.top, `${i}_top${Math.round(s0)}`)
        cur = Math.max(cur, s1)
      }
      piece(cur, t1, 60, H, `${i}_end`)
    }
    }

    // плинтус по периметру: комната перестаёт выглядеть картонной коробкой
    const ring = lite ? [] : offsetLoop(floor.wallGraph, room.nodeLoop, room.polygon, 1)
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
      decor.push(skirt)
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
  const byMaterial = new Map<string, Mesh[]>()
  for (const m of decor) {
    const key = m.material?.name ?? "none"
    byMaterial.set(key, [...(byMaterial.get(key) ?? []), m])
  }
  for (const [key, list] of byMaterial) {
    if (list.length === 1) { meshes.push(list[0]); continue }
    // слияние «запекает» мировые матрицы: снимаем с узла этажа, сливаем, вешаем
    // обратно — иначе смещение этажа применилось бы дважды
    for (const m of list) m.setParent(null)
    const merged = Mesh.MergeMeshes(list, true, true, undefined, false, true)
    if (!merged) { meshes.push(...list); continue }
    merged.name = `decor_${floor.id}_${key}`
    merged.setParent(parent)
    merged.isPickable = false
    merged.receiveShadows = true
    merged.metadata = { kind: "decor", floorId: floor.id }
    meshes.push(merged)
  }
  return meshes
}

// Санузел по наименованию: его пишет человек, поэтому шаблон знает и казахские
// слова — иначе «Дәретхана» получила бы керамогранит вместо плитки.
const WC_NAME = /санузел|с\/у|туалет|уборн|wc|душ|дәретхана|жуынатын/i

/** Пол по назначению, пока не выбран вручную: МОП — керамогранит, санузлы — плитка, техн. — наливной. */
function defaultFloorMaterial(floor: Floor, room: { id: string; polygon: Vec2[] }): string | undefined {
  const use = roomUse(floor, room)
  if (use === "rent") return undefined
  if (use === "tech") return "epoxy"
  return WC_NAME.test(roomDisplayName(floor, room)) ? "tile_white" : "granite_beige"
}

/** Отделка стен по назначению помещения: офисы — краска, санузлы — плитка, техн. — серая краска. */
function wallFinishMaterial(floor: Floor, room: { id: string; polygon: Vec2[] }): string {
  if (WC_NAME.test(roomDisplayName(floor, room))) return "tile_white"
  const use = roomUse(floor, room)
  if (use === "tech") return "paint_gray"
  return "paint_white"
}
