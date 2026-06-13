// ADR: Все мутации документа — только команды (§6.2). Каждая команда хранит МИНИМАЛЬНУЮ
// инверсию (а не снапшот всего проекта): для графа стен — прежний граф этажа (локальный
// срез), для перемещения узла — прежние координаты, и т.д. Стек undo/redo ≥200, drag
// схлопывается в одну команду через merge. Команды — транспорт для AI Mode (Фаза 5).

import type { BuilderDocument, Floor, BuilderObject, RoofConfig, Building, Opening, Stair, WaterBody, PathFeature, Pavement } from "@/types/builder"
import {
  type WallGraph,
  type WallDefaults,
  type WallKind,
  insertWall,
  moveNode as moveNodeGraph,
  removeEdge,
} from "@/core/geometry/wall-graph"
import { centroid, type Vec2 } from "@/core/geometry/math"
import { detectRooms } from "@/core/geometry/room-detection"
import { uid } from "@/core/id"
import type { RoomPreset } from "@/lib/builder/room-presets"

export interface Command {
  readonly kind: string
  readonly label: string
  apply(doc: BuilderDocument): BuilderDocument
  revert(doc: BuilderDocument): BuilderDocument
  merge?(next: Command): boolean // мутирует this, поглощая next; true если поглотил
}

// ── helpers ───────────────────────────────────────────────────────────────
function mapFloor(doc: BuilderDocument, floorId: string, fn: (f: Floor) => Floor): BuilderDocument {
  return {
    ...doc,
    buildings: doc.buildings.map((b) => ({
      ...b,
      floors: b.floors.map((f) => (f.id === floorId ? fn(f) : f)),
    })),
  }
}

export function findFloor(doc: BuilderDocument, floorId: string): Floor | undefined {
  for (const b of doc.buildings) {
    const f = b.floors.find((fl) => fl.id === floorId)
    if (f) return f
  }
  return undefined
}

// ── AddBuilding ─────────────────────────────────────────────────────────────
export class AddBuildingCommand implements Command {
  readonly kind = "add-building"
  readonly label = "здание"
  constructor(private building: Building) {}
  apply(doc: BuilderDocument): BuilderDocument {
    return { ...doc, buildings: [...doc.buildings, this.building] }
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return { ...doc, buildings: doc.buildings.filter((b) => b.id !== this.building.id) }
  }
}

// ── AddFloor ─────────────────────────────────────────────────────────────────
export class AddFloorCommand implements Command {
  readonly kind = "add-floor"
  readonly label = "этаж"
  constructor(private buildingId: string, private floor: Floor) {}
  apply(doc: BuilderDocument): BuilderDocument {
    return {
      ...doc,
      buildings: doc.buildings.map((b) =>
        b.id === this.buildingId ? { ...b, floors: [...b.floors, this.floor] } : b,
      ),
    }
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return {
      ...doc,
      buildings: doc.buildings.map((b) =>
        b.id === this.buildingId ? { ...b, floors: b.floors.filter((f) => f.id !== this.floor.id) } : b,
      ),
    }
  }
}

// ── InsertWall ────────────────────────────────────────────────────────────────
export class InsertWallCommand implements Command {
  readonly kind = "insert-wall"
  readonly label = "стена"
  private prev?: WallGraph
  constructor(private floorId: string, private p1: Vec2, private p2: Vec2, private def: WallDefaults) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (!f) return doc
    if (!this.prev) this.prev = f.wallGraph
    const { graph } = insertWall(f.wallGraph, this.p1, this.p2, this.def)
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: graph }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.prev) return doc
    const prev = this.prev
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: prev }))
  }
}

// ── Комната прямоугольником (4 стены) одним undo-шагом ───────────────────────
export class AddRoomCommand implements Command {
  readonly kind = "add-room"
  readonly label = "комната"
  private prev?: WallGraph
  constructor(private floorId: string, private x1: number, private y1: number, private x2: number, private y2: number, private def: WallDefaults) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (!f) return doc
    if (!this.prev) this.prev = f.wallGraph
    let g = f.wallGraph
    const corners: Array<[number, number]> = [
      [this.x1, this.y1],
      [this.x2, this.y1],
      [this.x2, this.y2],
      [this.x1, this.y2],
    ]
    for (let i = 0; i < 4; i++) {
      const a = corners[i]
      const b = corners[(i + 1) % 4]
      g = insertWall(g, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }, this.def).graph
    }
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: g }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.prev) return doc
    const prev = this.prev
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: prev }))
  }
}

// ── Перемещение стены (двигает оба узла на дельту) ────────────────────────────
export class MoveWallCommand implements Command {
  readonly kind = "move-wall"
  readonly label = "перемещение стены"
  private origA?: { x: number; y: number }
  private origB?: { x: number; y: number }
  private aId?: string
  private bId?: string
  constructor(private floorId: string, private edgeId: string, private dx: number, private dy: number) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    const e = f?.wallGraph.edges[this.edgeId]
    if (!f || !e) return doc
    if (!this.origA) {
      this.aId = e.a
      this.bId = e.b
      this.origA = { ...f.wallGraph.nodes[e.a] }
      this.origB = { ...f.wallGraph.nodes[e.b] }
    }
    const oa = this.origA
    const ob = this.origB
    let g = moveNodeGraph(f.wallGraph, this.aId as string, oa.x + this.dx, oa.y + this.dy)
    g = moveNodeGraph(g, this.bId as string, (ob as { x: number; y: number }).x + this.dx, (ob as { x: number; y: number }).y + this.dy)
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: g }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.origA || !this.origB || !this.aId || !this.bId) return doc
    const oa = this.origA
    const ob = this.origB
    return mapFloor(doc, this.floorId, (fl) => {
      let g = moveNodeGraph(fl.wallGraph, this.aId as string, oa.x, oa.y)
      g = moveNodeGraph(g, this.bId as string, ob.x, ob.y)
      return { ...fl, wallGraph: g }
    })
  }
  merge(next: Command): boolean {
    if (next instanceof MoveWallCommand && next.floorId === this.floorId && next.edgeId === this.edgeId) {
      this.dx = next.dx
      this.dy = next.dy
      return true
    }
    return false
  }
}

// ── Свойства стены (высота/толщина/тип) ───────────────────────────────────────
export class SetWallPropsCommand implements Command {
  readonly kind = "set-wall-props"
  readonly label = "свойства стены"
  private prev?: { height: number; thickness: number; kind: WallKind }
  private captured = false
  constructor(private floorId: string, private edgeId: string, private props: { height?: number; thickness?: number; kind?: WallKind }) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    const e = f?.wallGraph.edges[this.edgeId]
    if (e && !this.captured) {
      this.prev = { height: e.height, thickness: e.thickness, kind: e.kind }
      this.captured = true
    }
    return mapFloor(doc, this.floorId, (fl) => {
      const edges = { ...fl.wallGraph.edges }
      const edge = edges[this.edgeId]
      if (edge) edges[this.edgeId] = { ...edge, ...this.props }
      return { ...fl, wallGraph: { nodes: fl.wallGraph.nodes, edges } }
    })
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.prev) return doc
    const prev = this.prev
    return mapFloor(doc, this.floorId, (fl) => {
      const edges = { ...fl.wallGraph.edges }
      const edge = edges[this.edgeId]
      if (edge) edges[this.edgeId] = { ...edge, height: prev.height, thickness: prev.thickness, kind: prev.kind }
      return { ...fl, wallGraph: { nodes: fl.wallGraph.nodes, edges } }
    })
  }
}

// ── DeleteWall ───────────────────────────────────────────────────────────────
export class DeleteWallCommand implements Command {
  readonly kind = "delete-wall"
  readonly label = "удаление стены"
  private prev?: WallGraph
  constructor(private floorId: string, private edgeId: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (!f) return doc
    if (!this.prev) this.prev = f.wallGraph
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: removeEdge(fl.wallGraph, this.edgeId) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.prev) return doc
    const prev = this.prev
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: prev }))
  }
}

// ── MoveNode (с merge для drag) ─────────────────────────────────────────────
export class MoveNodeCommand implements Command {
  readonly kind = "move-node"
  readonly label = "перемещение узла"
  private prev?: Vec2
  constructor(private floorId: string, private nodeId: string, private target: Vec2) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (!f) return doc
    const n = f.wallGraph.nodes[this.nodeId]
    if (n && !this.prev) this.prev = { x: n.x, y: n.y }
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: moveNodeGraph(fl.wallGraph, this.nodeId, this.target.x, this.target.y) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.prev) return doc
    const prev = this.prev
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: moveNodeGraph(fl.wallGraph, this.nodeId, prev.x, prev.y) }))
  }
  merge(next: Command): boolean {
    if (next instanceof MoveNodeCommand && next.floorId === this.floorId && next.nodeId === this.nodeId) {
      this.target = next.target
      return true
    }
    return false
  }
}

// ── SetRoof ──────────────────────────────────────────────────────────────────
export class SetRoofCommand implements Command {
  readonly kind = "set-roof"
  readonly label = "крыша"
  private prev?: RoofConfig
  private captured = false
  constructor(private floorId: string, private roof: RoofConfig | undefined) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (!f) return doc
    if (!this.captured) {
      this.prev = f.roof
      this.captured = true
    }
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, roof: this.roof }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, roof: this.prev }))
  }
}

// ── AddObject / DeleteObject (этаж или участок) ─────────────────────────────
type ObjectTarget = { floorId: string } | { site: true }

export class AddObjectCommand implements Command {
  readonly kind = "add-object"
  readonly label = "объект"
  constructor(private target: ObjectTarget, private obj: BuilderObject) {}
  apply(doc: BuilderDocument): BuilderDocument {
    if ("site" in this.target) return { ...doc, site: { ...doc.site, objects: [...doc.site.objects, this.obj] } }
    return mapFloor(doc, this.target.floorId, (fl) => ({ ...fl, objects: [...fl.objects, this.obj] }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if ("site" in this.target) return { ...doc, site: { ...doc.site, objects: doc.site.objects.filter((o) => o.id !== this.obj.id) } }
    return mapFloor(doc, this.target.floorId, (fl) => ({ ...fl, objects: fl.objects.filter((o) => o.id !== this.obj.id) }))
  }
}

export class DeleteObjectCommand implements Command {
  readonly kind = "delete-object"
  readonly label = "удаление объекта"
  private removed?: BuilderObject
  constructor(private target: ObjectTarget, private objectId: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    if ("site" in this.target) {
      this.removed = doc.site.objects.find((o) => o.id === this.objectId) ?? this.removed
      return { ...doc, site: { ...doc.site, objects: doc.site.objects.filter((o) => o.id !== this.objectId) } }
    }
    const f = findFloor(doc, this.target.floorId)
    this.removed = f?.objects.find((o) => o.id === this.objectId) ?? this.removed
    return mapFloor(doc, this.target.floorId, (fl) => ({ ...fl, objects: fl.objects.filter((o) => o.id !== this.objectId) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.removed) return doc
    const obj = this.removed
    if ("site" in this.target) return { ...doc, site: { ...doc.site, objects: [...doc.site.objects, obj] } }
    return mapFloor(doc, this.target.floorId, (fl) => ({ ...fl, objects: [...fl.objects, obj] }))
  }
}

// ── Перемещение / поворот / масштаб объекта ──────────────────────────────────
function mapObject(doc: BuilderDocument, target: ObjectTarget, objectId: string, fn: (o: BuilderObject) => BuilderObject): BuilderDocument {
  if ("site" in target) {
    return { ...doc, site: { ...doc.site, objects: doc.site.objects.map((o) => (o.id === objectId ? fn(o) : o)) } }
  }
  return mapFloor(doc, target.floorId, (fl) => ({ ...fl, objects: fl.objects.map((o) => (o.id === objectId ? fn(o) : o)) }))
}

function findObject(doc: BuilderDocument, target: ObjectTarget, objectId: string): BuilderObject | undefined {
  if ("site" in target) return doc.site.objects.find((o) => o.id === objectId)
  return findFloor(doc, target.floorId)?.objects.find((o) => o.id === objectId)
}

export class MoveObjectCommand implements Command {
  readonly kind = "move-object"
  readonly label = "перемещение объекта"
  private prev?: { x: number; z: number }
  constructor(private target: ObjectTarget, private objectId: string, private x: number, private z: number) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const o = findObject(doc, this.target, this.objectId)
    if (o && !this.prev) this.prev = { x: o.position.x, z: o.position.z }
    return mapObject(doc, this.target, this.objectId, (ob) => ({ ...ob, position: { ...ob.position, x: this.x, z: this.z } }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.prev) return doc
    const prev = this.prev
    return mapObject(doc, this.target, this.objectId, (ob) => ({ ...ob, position: { ...ob.position, x: prev.x, z: prev.z } }))
  }
  merge(next: Command): boolean {
    if (next instanceof MoveObjectCommand && next.objectId === this.objectId) {
      this.x = next.x
      this.z = next.z
      return true
    }
    return false
  }
}

export class SetObjectRotationCommand implements Command {
  readonly kind = "rotate-object"
  readonly label = "поворот объекта"
  private prev?: number
  private captured = false
  constructor(private target: ObjectTarget, private objectId: string, private rotationY: number) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const o = findObject(doc, this.target, this.objectId)
    if (o && !this.captured) {
      this.prev = o.rotationY
      this.captured = true
    }
    return mapObject(doc, this.target, this.objectId, (ob) => ({ ...ob, rotationY: this.rotationY }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (this.prev === undefined) return doc
    const prev = this.prev
    return mapObject(doc, this.target, this.objectId, (ob) => ({ ...ob, rotationY: prev }))
  }
}

export class SetObjectScaleCommand implements Command {
  readonly kind = "scale-object"
  readonly label = "масштаб объекта"
  private prev?: number
  private captured = false
  constructor(private target: ObjectTarget, private objectId: string, private scale: number) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const o = findObject(doc, this.target, this.objectId)
    if (o && !this.captured) {
      this.prev = o.scale
      this.captured = true
    }
    return mapObject(doc, this.target, this.objectId, (ob) => ({ ...ob, scale: this.scale }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (this.prev === undefined) return doc
    const prev = this.prev
    return mapObject(doc, this.target, this.objectId, (ob) => ({ ...ob, scale: prev }))
  }
}

// Растяжение объекта по ширине (X) / высоте (Y) / глубине (Z) поверх общего scale.
export class SetObjectSizeCommand implements Command {
  readonly kind = "size-object"
  readonly label = "размер объекта"
  private prevX?: number
  private prevY?: number
  private prevZ?: number
  private captured = false
  constructor(private target: ObjectTarget, private objectId: string, private size: { scaleX?: number; scaleY?: number; scaleZ?: number }) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const o = findObject(doc, this.target, this.objectId)
    if (o && !this.captured) {
      this.prevX = o.scaleX ?? 1
      this.prevY = o.scaleY ?? 1
      this.prevZ = o.scaleZ ?? 1
      this.captured = true
    }
    return mapObject(doc, this.target, this.objectId, (ob) => ({
      ...ob,
      scaleX: this.size.scaleX ?? ob.scaleX ?? 1,
      scaleY: this.size.scaleY ?? ob.scaleY ?? 1,
      scaleZ: this.size.scaleZ ?? ob.scaleZ ?? 1,
    }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.captured) return doc
    return mapObject(doc, this.target, this.objectId, (ob) => ({ ...ob, scaleX: this.prevX, scaleY: this.prevY, scaleZ: this.prevZ }))
  }
}

// ── Рельеф (heightmap) ────────────────────────────────────────────────────────
export class SetTerrainCommand implements Command {
  readonly kind = "set-terrain"
  readonly label = "рельеф"
  private prev?: number[]
  private captured = false
  constructor(private heightmap: number[]) {}
  apply(doc: BuilderDocument): BuilderDocument {
    if (!this.captured) {
      this.prev = doc.site.heightmap ? [...doc.site.heightmap] : undefined
      this.captured = true
    }
    return { ...doc, site: { ...doc.site, heightmap: [...this.heightmap] } }
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return { ...doc, site: { ...doc.site, heightmap: this.prev ? [...this.prev] : undefined } }
  }
  merge(next: Command): boolean {
    if (next instanceof SetTerrainCommand) {
      this.heightmap = next.heightmap
      return true
    }
    return false
  }
}

// ── Водоёмы (вода по сплайну) ────────────────────────────────────────────────
export class AddWaterCommand implements Command {
  readonly kind = "add-water"
  readonly label = "водоём"
  constructor(private body: WaterBody) {}
  apply(doc: BuilderDocument): BuilderDocument {
    return { ...doc, site: { ...doc.site, water: [...(doc.site.water ?? []), this.body] } }
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return { ...doc, site: { ...doc.site, water: (doc.site.water ?? []).filter((w) => w.id !== this.body.id) } }
  }
}

export class DeleteWaterCommand implements Command {
  readonly kind = "delete-water"
  readonly label = "удаление водоёма"
  private removed?: WaterBody
  constructor(private waterId: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    this.removed = (doc.site.water ?? []).find((w) => w.id === this.waterId) ?? this.removed
    return { ...doc, site: { ...doc.site, water: (doc.site.water ?? []).filter((w) => w.id !== this.waterId) } }
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.removed) return doc
    return { ...doc, site: { ...doc.site, water: [...(doc.site.water ?? []), this.removed] } }
  }
}

// ── Линейные элементы (дороги/дорожки/заборы по сплайну) ─────────────────────
export class AddPathCommand implements Command {
  readonly kind = "add-path"
  readonly label = "линия"
  constructor(private feature: PathFeature) {}
  apply(doc: BuilderDocument): BuilderDocument {
    return { ...doc, site: { ...doc.site, paths: [...(doc.site.paths ?? []), this.feature] } }
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return { ...doc, site: { ...doc.site, paths: (doc.site.paths ?? []).filter((p) => p.id !== this.feature.id) } }
  }
}

export class DeletePathCommand implements Command {
  readonly kind = "delete-path"
  readonly label = "удаление линии"
  private removed?: PathFeature
  constructor(private pathId: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    this.removed = (doc.site.paths ?? []).find((p) => p.id === this.pathId) ?? this.removed
    return { ...doc, site: { ...doc.site, paths: (doc.site.paths ?? []).filter((p) => p.id !== this.pathId) } }
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.removed) return doc
    return { ...doc, site: { ...doc.site, paths: [...(doc.site.paths ?? []), this.removed] } }
  }
}

// ── Площадки-покрытия (заливка контура материалом) ───────────────────────────
export class AddPavementCommand implements Command {
  readonly kind = "add-pavement"
  readonly label = "площадка"
  constructor(private pavement: Pavement) {}
  apply(doc: BuilderDocument): BuilderDocument {
    return { ...doc, site: { ...doc.site, pavements: [...(doc.site.pavements ?? []), this.pavement] } }
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return { ...doc, site: { ...doc.site, pavements: (doc.site.pavements ?? []).filter((p) => p.id !== this.pavement.id) } }
  }
}

export class DeletePavementCommand implements Command {
  readonly kind = "delete-pavement"
  readonly label = "удаление площадки"
  private removed?: Pavement
  constructor(private pavementId: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    this.removed = (doc.site.pavements ?? []).find((p) => p.id === this.pavementId) ?? this.removed
    return { ...doc, site: { ...doc.site, pavements: (doc.site.pavements ?? []).filter((p) => p.id !== this.pavementId) } }
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.removed) return doc
    return { ...doc, site: { ...doc.site, pavements: [...(doc.site.pavements ?? []), this.removed] } }
  }
}

// ── Room Style Preset (материал пола + набор объектов одной командой) ─────────
export class ApplyRoomPresetCommand implements Command {
  readonly kind = "room-preset"
  readonly label = "стиль комнаты"
  private prevMat?: string
  private addedIds: string[] = []
  private captured = false
  constructor(private floorId: string, private roomId: string, private preset: RoomPreset) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (!f) return doc
    const room = detectRooms(f.wallGraph).find((r) => r.id === this.roomId)
    if (!room) return doc
    const c = centroid(room.polygon)
    if (!this.captured) {
      this.prevMat = f.roomMaterials[this.roomId]
      this.addedIds = this.preset.objects.map(() => uid("o"))
      this.captured = true
    }
    const objs: BuilderObject[] = this.preset.objects.map((o, i) => ({
      id: this.addedIds[i],
      assetId: o.assetId,
      position: { x: c.x + o.dx, y: 0, z: c.y + o.dz },
      rotationY: o.rot ?? 0,
      scale: 1,
      attachTo: "floor",
      locked: false,
    }))
    return mapFloor(doc, this.floorId, (fl) => ({
      ...fl,
      roomMaterials: { ...fl.roomMaterials, [this.roomId]: this.preset.floorMaterial },
      objects: [...fl.objects, ...objs],
    }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    const ids = new Set(this.addedIds)
    return mapFloor(doc, this.floorId, (fl) => {
      const rm = { ...fl.roomMaterials }
      if (this.prevMat) rm[this.roomId] = this.prevMat
      else delete rm[this.roomId]
      return { ...fl, roomMaterials: rm, objects: fl.objects.filter((o) => !ids.has(o.id)) }
    })
  }
}

// ── LinkPremise ──────────────────────────────────────────────────────────────
export class LinkPremiseCommand implements Command {
  readonly kind = "link-premise"
  readonly label = "привязка помещения"
  private prev?: string
  private captured = false
  constructor(private floorId: string, private roomId: string, private premiseId: string | null) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (!f) return doc
    if (!this.captured) {
      this.prev = f.premiseLinks[this.roomId]
      this.captured = true
    }
    return mapFloor(doc, this.floorId, (fl) => {
      const links = { ...fl.premiseLinks }
      if (this.premiseId) links[this.roomId] = this.premiseId
      else delete links[this.roomId]
      return { ...fl, premiseLinks: links }
    })
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => {
      const links = { ...fl.premiseLinks }
      if (this.prev) links[this.roomId] = this.prev
      else delete links[this.roomId]
      return { ...fl, premiseLinks: links }
    })
  }
}

// ── Проёмы (двери/окна) ───────────────────────────────────────────────────────
export class AddOpeningCommand implements Command {
  readonly kind = "add-opening"
  readonly label = "проём"
  constructor(private floorId: string, private opening: Opening) {}
  apply(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, openings: [...fl.openings, this.opening] }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, openings: fl.openings.filter((o) => o.id !== this.opening.id) }))
  }
}

export class DeleteOpeningCommand implements Command {
  readonly kind = "delete-opening"
  readonly label = "удаление проёма"
  private removed?: Opening
  constructor(private floorId: string, private openingId: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    this.removed = f?.openings.find((o) => o.id === this.openingId) ?? this.removed
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, openings: fl.openings.filter((o) => o.id !== this.openingId) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.removed) return doc
    const op = this.removed
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, openings: [...fl.openings, op] }))
  }
}

export class MoveOpeningCommand implements Command {
  readonly kind = "move-opening"
  readonly label = "сдвиг проёма"
  private prev?: number
  private captured = false
  constructor(private floorId: string, private openingId: string, private offset: number) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    const op = f?.openings.find((o) => o.id === this.openingId)
    if (op && !this.captured) {
      this.prev = op.offset
      this.captured = true
    }
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, openings: fl.openings.map((o) => (o.id === this.openingId ? { ...o, offset: this.offset } : o)) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (this.prev === undefined) return doc
    const prev = this.prev
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, openings: fl.openings.map((o) => (o.id === this.openingId ? { ...o, offset: prev } : o)) }))
  }
  merge(next: Command): boolean {
    if (next instanceof MoveOpeningCommand && next.floorId === this.floorId && next.openingId === this.openingId) {
      this.offset = next.offset
      return true
    }
    return false
  }
}

// ── Лестницы ──────────────────────────────────────────────────────────────────
export class AddStairCommand implements Command {
  readonly kind = "add-stair"
  readonly label = "лестница"
  constructor(private floorId: string, private stair: Stair) {}
  apply(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, stairs: [...fl.stairs, this.stair] }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, stairs: fl.stairs.filter((s) => s.id !== this.stair.id) }))
  }
}

export class DeleteStairCommand implements Command {
  readonly kind = "delete-stair"
  readonly label = "удаление лестницы"
  private removed?: Stair
  constructor(private floorId: string, private stairId: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    this.removed = f?.stairs.find((s) => s.id === this.stairId) ?? this.removed
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, stairs: fl.stairs.filter((s) => s.id !== this.stairId) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.removed) return doc
    const st = this.removed
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, stairs: [...fl.stairs, st] }))
  }
}

// ── Размер/вариант проёма ─────────────────────────────────────────────────────
export class SetOpeningSizeCommand implements Command {
  readonly kind = "set-opening-size"
  readonly label = "размер проёма"
  private prev?: { width: number; height: number; sillHeight: number; variant: string }
  private captured = false
  constructor(private floorId: string, private openingId: string, private props: { width?: number; height?: number; sillHeight?: number; variant?: string }) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    const o = f?.openings.find((op) => op.id === this.openingId)
    if (o && !this.captured) {
      this.prev = { width: o.width, height: o.height, sillHeight: o.sillHeight, variant: o.variant }
      this.captured = true
    }
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, openings: fl.openings.map((op) => (op.id === this.openingId ? { ...op, ...this.props } : op)) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.prev) return doc
    const prev = this.prev
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, openings: fl.openings.map((op) => (op.id === this.openingId ? { ...op, ...prev } : op)) }))
  }
}

// ── Свойства / перемещение лестницы ───────────────────────────────────────────
export class SetStairCommand implements Command {
  readonly kind = "set-stair"
  readonly label = "лестница"
  private prev?: { shape: "straight" | "l" | "u" | "spiral"; width: number; rotationDeg: number; mirror: boolean }
  private captured = false
  constructor(private floorId: string, private stairId: string, private props: { shape?: "straight" | "l" | "u" | "spiral"; width?: number; rotationDeg?: number; mirror?: boolean }) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    const s = f?.stairs.find((st) => st.id === this.stairId)
    if (s && !this.captured) {
      this.prev = { shape: s.shape, width: s.width, rotationDeg: s.rotationDeg, mirror: s.mirror ?? false }
      this.captured = true
    }
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, stairs: fl.stairs.map((st) => (st.id === this.stairId ? { ...st, ...this.props } : st)) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.prev) return doc
    const prev = this.prev
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, stairs: fl.stairs.map((st) => (st.id === this.stairId ? { ...st, ...prev } : st)) }))
  }
}

export class MoveStairCommand implements Command {
  readonly kind = "move-stair"
  readonly label = "перемещение лестницы"
  private prev?: { x: number; y: number }
  constructor(private floorId: string, private stairId: string, private x: number, private y: number) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    const s = f?.stairs.find((st) => st.id === this.stairId)
    if (s && !this.prev) this.prev = { x: s.position.x, y: s.position.y }
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, stairs: fl.stairs.map((st) => (st.id === this.stairId ? { ...st, position: { x: this.x, y: this.y } } : st)) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.prev) return doc
    const prev = this.prev
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, stairs: fl.stairs.map((st) => (st.id === this.stairId ? { ...st, position: prev } : st)) }))
  }
  merge(next: Command): boolean {
    if (next instanceof MoveStairCommand && next.floorId === this.floorId && next.stairId === this.stairId) {
      this.x = next.x
      this.y = next.y
      return true
    }
    return false
  }
}

// ── Материалы (ведро) ─────────────────────────────────────────────────────────
export class SetWallMaterialCommand implements Command {
  readonly kind = "set-wall-material"
  readonly label = "материал стены"
  private prev?: { facade?: string; interior?: string }
  private captured = false
  constructor(private floorId: string, private edgeId: string, private materialId: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    const e = f?.wallGraph.edges[this.edgeId]
    if (e && !this.captured) {
      this.prev = { facade: e.facadeMaterialId, interior: e.interiorMaterialId }
      this.captured = true
    }
    return mapFloor(doc, this.floorId, (fl) => {
      const edges = { ...fl.wallGraph.edges }
      const edge = edges[this.edgeId]
      if (edge) edges[this.edgeId] = { ...edge, facadeMaterialId: this.materialId, interiorMaterialId: this.materialId }
      return { ...fl, wallGraph: { nodes: fl.wallGraph.nodes, edges } }
    })
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => {
      const edges = { ...fl.wallGraph.edges }
      const edge = edges[this.edgeId]
      if (edge) edges[this.edgeId] = { ...edge, facadeMaterialId: this.prev?.facade, interiorMaterialId: this.prev?.interior }
      return { ...fl, wallGraph: { nodes: fl.wallGraph.nodes, edges } }
    })
  }
}

export class SetRoomMaterialCommand implements Command {
  readonly kind = "set-room-material"
  readonly label = "материал пола"
  private prev?: string
  private captured = false
  constructor(private floorId: string, private roomId: string, private materialId: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (f && !this.captured) {
      this.prev = f.roomMaterials[this.roomId]
      this.captured = true
    }
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, roomMaterials: { ...fl.roomMaterials, [this.roomId]: this.materialId } }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => {
      const rm = { ...fl.roomMaterials }
      if (this.prev) rm[this.roomId] = this.prev
      else delete rm[this.roomId]
      return { ...fl, roomMaterials: rm }
    })
  }
}

// ── Стек команд ──────────────────────────────────────────────────────────────
const HISTORY_LIMIT = 300

export class CommandStack {
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  constructor(private getDoc: () => BuilderDocument, private setDoc: (d: BuilderDocument) => void) {}

  execute(cmd: Command): void {
    const next = cmd.apply(this.getDoc())
    this.setDoc(next)
    const top = this.undoStack[this.undoStack.length - 1]
    if (top && top.merge && top.merge(cmd)) {
      // поглощено в предыдущую команду (drag) — историю не растим
    } else {
      this.undoStack.push(cmd)
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
    }
    this.redoStack = []
  }

  undo(): void {
    const cmd = this.undoStack.pop()
    if (!cmd) return
    this.setDoc(cmd.revert(this.getDoc()))
    this.redoStack.push(cmd)
  }

  redo(): void {
    const cmd = this.redoStack.pop()
    if (!cmd) return
    this.setDoc(cmd.apply(this.getDoc()))
    this.undoStack.push(cmd)
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }
  canRedo(): boolean {
    return this.redoStack.length > 0
  }
  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}
