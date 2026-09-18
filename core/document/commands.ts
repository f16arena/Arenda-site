// ADR: Все мутации документа — только команды (§6.2). Каждая команда хранит МИНИМАЛЬНУЮ
// инверсию (а не снапшот всего проекта): для графа стен — прежний граф этажа (локальный
// срез), для перемещения узла — прежние координаты, и т.д. Стек undo/redo ≥200, drag
// схлопывается в одну команду через merge. Команды — транспорт для AI Mode (Фаза 5).

import type { BuilderDocument, Floor, BuilderObject, RoofConfig, Building, Opening, Stair, Island, WaterBody, PathFeature, Pavement, MepRun, MepDevice, SectionLineDoc, Annotation } from "@/types/builder"
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
import { remapOpenings, transformWalls, type WallXf } from "@/lib/builder/wall-transform"

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

// ── ReplaceFloor (этаж целиком заменяется другим, напр. сброс к данным) ───────
export class ReplaceFloorCommand implements Command {
  readonly kind = "replace-floor"
  readonly label = "сброс этажа"
  constructor(private buildingId: string, private next: Floor, private prev: Floor) {}
  private swap(doc: BuilderDocument, floor: Floor): BuilderDocument {
    return {
      ...doc,
      buildings: doc.buildings.map((b) =>
        b.id === this.buildingId ? { ...b, floors: b.floors.map((f) => (f.id === floor.id ? floor : f)) } : b,
      ),
    }
  }
  apply(doc: BuilderDocument): BuilderDocument {
    return this.swap(doc, this.next)
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return this.swap(doc, this.prev)
  }
}

// ── DeleteFloor (удаление этажа целиком, с возможностью undo) ──────────────────
export class DeleteFloorCommand implements Command {
  readonly kind = "delete-floor"
  readonly label = "удалить этаж"
  private removed?: Floor
  private index = -1
  private captured = false
  constructor(private buildingId: string, private floorId: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    if (!this.captured) {
      const b = doc.buildings.find((bld) => bld.id === this.buildingId)
      this.index = b?.floors.findIndex((f) => f.id === this.floorId) ?? -1
      this.removed = this.index >= 0 ? b?.floors[this.index] : undefined
      this.captured = true
    }
    return {
      ...doc,
      buildings: doc.buildings.map((b) =>
        b.id === this.buildingId ? { ...b, floors: b.floors.filter((f) => f.id !== this.floorId) } : b,
      ),
    }
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.removed) return doc
    const floor = this.removed
    const at = this.index
    return {
      ...doc,
      buildings: doc.buildings.map((b) => {
        if (b.id !== this.buildingId) return b
        const floors = [...b.floors]
        floors.splice(at >= 0 && at <= floors.length ? at : floors.length, 0, floor)
        return { ...b, floors }
      }),
    }
  }
}

// ── SetFloorName (переименование уровня: «1 этаж», «Цоколь», «Подвал» — на выбор) ─
/**
 * Отметка пола этажа. С shiftAbove этажи выше сдвигаются на ту же величину —
 * стопка не расходится и не входит сама в себя.
 */
export class SetFloorElevationCommand implements Command {
  readonly kind = "set-floor-elevation"
  readonly label = "отметка этажа"
  private moved: string[] | null = null
  private delta = 0
  constructor(private floorId: string, private elevation: number, private shiftAbove = true) {}
  apply(doc: BuilderDocument): BuilderDocument {
    if (!this.moved) {
      const b = doc.buildings.find((bb) => bb.floors.some((f) => f.id === this.floorId))
      const f = b?.floors.find((fl) => fl.id === this.floorId)
      if (!b || !f) return doc
      this.delta = this.elevation - f.elevation
      this.moved = b.floors.filter((fl) => fl.id === f.id || (this.shiftAbove && fl.level > f.level)).map((fl) => fl.id)
    }
    return this.shift(doc, this.delta)
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return this.moved ? this.shift(doc, -this.delta) : doc
  }
  private shift(doc: BuilderDocument, d: number): BuilderDocument {
    const ids = new Set(this.moved ?? [])
    return {
      ...doc,
      buildings: doc.buildings.map((b) => ({ ...b, floors: b.floors.map((f) => (ids.has(f.id) ? { ...f, elevation: f.elevation + d } : f)) })),
    }
  }
}

export class SetFloorNameCommand implements Command {
  readonly kind = "set-floor-name"
  readonly label = "имя этажа"
  private prev?: string
  private captured = false
  constructor(private floorId: string, private name: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (f && !this.captured) {
      this.prev = f.name
      this.captured = true
    }
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, name: this.name }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (this.prev === undefined) return doc
    const prev = this.prev
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, name: prev }))
  }
}

// ── InsertWall ────────────────────────────────────────────────────────────────
export class InsertWallCommand implements Command {
  readonly kind = "insert-wall"
  readonly label = "стена"
  private prev?: WallGraph
  private prevOpenings?: Opening[]
  constructor(private floorId: string, private p1: Vec2, private p2: Vec2, private def: WallDefaults) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (!f) return doc
    if (!this.prev) { this.prev = f.wallGraph; this.prevOpenings = f.openings }
    const { graph } = insertWall(f.wallGraph, this.p1, this.p2, this.def)
    // примыкание делит стену: дверь или окно на ней переезжают на нужную часть
    const openings = remapOpenings(f.wallGraph, graph, f.openings)
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: graph, openings }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.prev) return doc
    const prev = this.prev
    const ops = this.prevOpenings
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: prev, openings: ops ?? fl.openings }))
  }
}

// ── Комната прямоугольником (4 стены) одним undo-шагом ───────────────────────
export class AddRoomCommand implements Command {
  readonly kind = "add-room"
  readonly label = "комната"
  private prev?: WallGraph
  private prevOpenings?: Opening[]
  constructor(private floorId: string, private x1: number, private y1: number, private x2: number, private y2: number, private def: WallDefaults) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (!f) return doc
    if (!this.prev) { this.prev = f.wallGraph; this.prevOpenings = f.openings }
    let g = f.wallGraph
    let openings = f.openings
    const corners: Array<[number, number]> = [
      [this.x1, this.y1],
      [this.x2, this.y1],
      [this.x2, this.y2],
      [this.x1, this.y2],
    ]
    for (let i = 0; i < 4; i++) {
      const a = corners[i]
      const b = corners[(i + 1) % 4]
      const before = g
      g = insertWall(g, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }, this.def).graph
      openings = remapOpenings(before, g, openings)
    }
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: g, openings }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.prev) return doc
    const prev = this.prev
    const ops = this.prevOpenings
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: prev, openings: ops ?? fl.openings }))
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
  private prevOpenings?: Opening[]
  constructor(private floorId: string, private edgeId: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (!f) return doc
    if (!this.prev) { this.prev = f.wallGraph; this.prevOpenings = f.openings }
    // проёмы удалённой стены уходят вместе с ней, а не висят невидимыми
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: removeEdge(fl.wallGraph, this.edgeId), openings: fl.openings.filter((o) => o.wallId !== this.edgeId) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.prev) return doc
    const prev = this.prev
    const ops = this.prevOpenings
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: prev, openings: ops ?? fl.openings }))
  }
}

// ── Composite: несколько правок — один шаг истории (групповое удаление) ─────────
export class CompositeCommand implements Command {
  readonly kind = "composite"
  constructor(readonly label: string, private commands: Command[]) {}
  apply(doc: BuilderDocument): BuilderDocument {
    return this.commands.reduce((d, c) => c.apply(d), doc)
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return [...this.commands].reverse().reduce((d, c) => c.revert(d), doc)
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

// ── Подложка этажа ────────────────────────────────────────────────────────────
export class SetUnderlayCommand implements Command {
  readonly kind = "set-underlay"
  readonly label = "подложка"
  private prev?: Floor["underlay"]
  private captured = false
  // mergeKey: подряд идущие правки одного рода (ползунок прозрачности) — одна
  // запись истории, а не сотня на одно движение мыши
  constructor(private floorId: string, private underlay: Floor["underlay"] | null, private mergeKey?: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (!f) return doc
    if (!this.captured) {
      this.prev = f.underlay
      this.captured = true
    }
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, underlay: this.underlay ?? undefined }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, underlay: this.prev }))
  }
  merge(next: Command): boolean {
    if (next instanceof SetUnderlayCommand && this.mergeKey && next.mergeKey === this.mergeKey && next.floorId === this.floorId) {
      this.underlay = next.underlay
      return true
    }
    return false
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

// ── Островки (арендные места в общих зонах) ───────────────────────────────────
export class AddIslandCommand implements Command {
  readonly kind = "add-island"
  readonly label = "островок"
  constructor(private floorId: string, private island: Island) {}
  apply(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, islands: [...(fl.islands ?? []), this.island] }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, islands: (fl.islands ?? []).filter((i) => i.id !== this.island.id) }))
  }
}

export class DeleteIslandCommand implements Command {
  readonly kind = "delete-island"
  readonly label = "удаление островка"
  private removed?: Island
  constructor(private floorId: string, private islandId: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    this.removed = (f?.islands ?? []).find((i) => i.id === this.islandId) ?? this.removed
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, islands: (fl.islands ?? []).filter((i) => i.id !== this.islandId) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.removed) return doc
    const isl = this.removed
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, islands: [...(fl.islands ?? []), isl] }))
  }
}

type IslandProps = Partial<Pick<Island, "kind" | "name" | "tenant" | "width" | "depth" | "height" | "rotationDeg">>

export class SetIslandCommand implements Command {
  readonly kind = "set-island"
  readonly label = "островок"
  private prev?: IslandProps
  private captured = false
  constructor(private floorId: string, private islandId: string, private props: IslandProps) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    const i = (f?.islands ?? []).find((x) => x.id === this.islandId)
    if (i && !this.captured) {
      this.prev = { kind: i.kind, name: i.name, tenant: i.tenant, width: i.width, depth: i.depth, height: i.height, rotationDeg: i.rotationDeg }
      this.captured = true
    }
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, islands: (fl.islands ?? []).map((x) => (x.id === this.islandId ? { ...x, ...this.props } : x)) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.prev) return doc
    const prev = this.prev
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, islands: (fl.islands ?? []).map((x) => (x.id === this.islandId ? { ...x, ...prev } : x)) }))
  }
}

export class MoveIslandCommand implements Command {
  readonly kind = "move-island"
  readonly label = "перемещение островка"
  private prev?: { x: number; y: number }
  constructor(private floorId: string, private islandId: string, private x: number, private y: number) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    const i = (f?.islands ?? []).find((x) => x.id === this.islandId)
    if (i && !this.prev) this.prev = { x: i.position.x, y: i.position.y }
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, islands: (fl.islands ?? []).map((x) => (x.id === this.islandId ? { ...x, position: { x: this.x, y: this.y } } : x)) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    if (!this.prev) return doc
    const prev = this.prev
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, islands: (fl.islands ?? []).map((x) => (x.id === this.islandId ? { ...x, position: prev } : x)) }))
  }
  merge(next: Command): boolean {
    if (next instanceof MoveIslandCommand && next.floorId === this.floorId && next.islandId === this.islandId) {
      this.x = next.x
      this.y = next.y
      return true
    }
    return false
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
  private prev?: { shape: Stair["shape"]; width: number; rotationDeg: number; mirror: boolean; rise?: number; depth?: number; tread?: number }
  private captured = false
  constructor(private floorId: string, private stairId: string, private props: { shape?: Stair["shape"]; width?: number; rotationDeg?: number; mirror?: boolean; rise?: number; depth?: number; tread?: number }) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    const s = f?.stairs.find((st) => st.id === this.stairId)
    if (s && !this.captured) {
      this.prev = { shape: s.shape, width: s.width, rotationDeg: s.rotationDeg, mirror: s.mirror ?? false, rise: s.rise, depth: s.depth, tread: s.tread }
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

// ── Инженерные сети ──────────────────────────────────────────────────────────
type MepKey = "mepRuns" | "mepDevices"
type MepItem<K extends MepKey> = K extends "mepRuns" ? MepRun : MepDevice

function mepList<K extends MepKey>(f: Floor, key: K): MepItem<K>[] {
  return ((f[key] as MepItem<K>[] | undefined) ?? [])
}

class AddMepCommand<K extends MepKey> implements Command {
  readonly kind: string
  constructor(readonly label: string, private floorId: string, private key: K, private item: MepItem<K>) {
    this.kind = `add-${key}`
  }
  apply(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, [this.key]: [...mepList(fl, this.key), this.item] }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, [this.key]: mepList(fl, this.key).filter((x) => x.id !== this.item.id) }))
  }
}

class DeleteMepCommand<K extends MepKey> implements Command {
  readonly kind: string
  private removed?: { item: MepItem<K>; index: number }
  constructor(readonly label: string, private floorId: string, private key: K, private id: string) {
    this.kind = `delete-${key}`
  }
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    const list = f ? mepList(f, this.key) : []
    const index = list.findIndex((x) => x.id === this.id)
    if (index >= 0) this.removed = { item: list[index], index }
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, [this.key]: mepList(fl, this.key).filter((x) => x.id !== this.id) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    const r = this.removed
    if (!r) return doc
    return mapFloor(doc, this.floorId, (fl) => {
      const list = [...mepList(fl, this.key)]
      list.splice(Math.min(r.index, list.length), 0, r.item)
      return { ...fl, [this.key]: list }
    })
  }
}

class UpdateMepCommand<K extends MepKey> implements Command {
  readonly kind: string
  private prev?: MepItem<K>
  constructor(readonly label: string, private floorId: string, private key: K, private id: string, private props: Partial<MepItem<K>>, private mergeKey?: string) {
    this.kind = `update-${key}`
  }
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    const cur = f ? mepList(f, this.key).find((x) => x.id === this.id) : undefined
    if (cur && !this.prev) this.prev = cur
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, [this.key]: mepList(fl, this.key).map((x) => (x.id === this.id ? { ...x, ...this.props } : x)) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    const prev = this.prev
    if (!prev) return doc
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, [this.key]: mepList(fl, this.key).map((x) => (x.id === this.id ? prev : x)) }))
  }
  merge(next: Command): boolean {
    if (next instanceof UpdateMepCommand && this.mergeKey && next.mergeKey === this.mergeKey && next.id === this.id && next.floorId === this.floorId) {
      this.props = { ...this.props, ...next.props }
      return true
    }
    return false
  }
}

export class AddMepRunCommand extends AddMepCommand<"mepRuns"> {
  constructor(floorId: string, run: MepRun) { super("трасса сети", floorId, "mepRuns", run) }
}
export class AddMepDeviceCommand extends AddMepCommand<"mepDevices"> {
  constructor(floorId: string, device: MepDevice) { super("прибор сети", floorId, "mepDevices", device) }
}
export class DeleteMepRunCommand extends DeleteMepCommand<"mepRuns"> {
  constructor(floorId: string, id: string) { super("удаление трассы", floorId, "mepRuns", id) }
}
export class DeleteMepDeviceCommand extends DeleteMepCommand<"mepDevices"> {
  constructor(floorId: string, id: string) { super("удаление прибора", floorId, "mepDevices", id) }
}
export class UpdateMepRunCommand extends UpdateMepCommand<"mepRuns"> {
  constructor(floorId: string, id: string, props: Partial<MepRun>, mergeKey?: string) { super("трасса сети", floorId, "mepRuns", id, props, mergeKey) }
}
export class UpdateMepDeviceCommand extends UpdateMepCommand<"mepDevices"> {
  constructor(floorId: string, id: string, props: Partial<MepDevice>, mergeKey?: string) { super("прибор сети", floorId, "mepDevices", id, props, mergeKey) }
}

// ── Линии разрезов здания ────────────────────────────────────────────────────
function mapSections(doc: BuilderDocument, buildingId: string, fn: (list: SectionLineDoc[]) => SectionLineDoc[]): BuilderDocument {
  return { ...doc, buildings: doc.buildings.map((b) => (b.id === buildingId ? { ...b, sections: fn(b.sections ?? []) } : b)) }
}

export class AddSectionCommand implements Command {
  readonly kind = "add-section"
  readonly label = "разрез"
  constructor(private buildingId: string, private section: SectionLineDoc) {}
  apply(doc: BuilderDocument): BuilderDocument {
    return mapSections(doc, this.buildingId, (l) => [...l, this.section])
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return mapSections(doc, this.buildingId, (l) => l.filter((s) => s.id !== this.section.id))
  }
}

export class DeleteSectionCommand implements Command {
  readonly kind = "delete-section"
  readonly label = "удаление разреза"
  private removed?: { s: SectionLineDoc; i: number }
  constructor(private buildingId: string, private id: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const list = doc.buildings.find((b) => b.id === this.buildingId)?.sections ?? []
    const i = list.findIndex((s) => s.id === this.id)
    if (i >= 0) this.removed = { s: list[i], i }
    return mapSections(doc, this.buildingId, (l) => l.filter((s) => s.id !== this.id))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    const r = this.removed
    if (!r) return doc
    return mapSections(doc, this.buildingId, (l) => { const n = [...l]; n.splice(Math.min(r.i, n.length), 0, r.s); return n })
  }
}

export class UpdateSectionCommand implements Command {
  readonly kind = "update-section"
  readonly label = "разрез"
  private prev?: SectionLineDoc
  constructor(private buildingId: string, private id: string, private props: Partial<SectionLineDoc>) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const cur = doc.buildings.find((b) => b.id === this.buildingId)?.sections?.find((s) => s.id === this.id)
    if (cur && !this.prev) this.prev = cur
    return mapSections(doc, this.buildingId, (l) => l.map((s) => (s.id === this.id ? { ...s, ...this.props } : s)))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    const prev = this.prev
    if (!prev) return doc
    return mapSections(doc, this.buildingId, (l) => l.map((s) => (s.id === this.id ? prev : s)))
  }
}

/** Следующее свободное имя разреза: 1-1, 2-2, … */
export function nextSectionName(doc: BuilderDocument, buildingId: string): string {
  const used = new Set((doc.buildings.find((b) => b.id === buildingId)?.sections ?? []).map((s) => s.name))
  for (let i = 1; ; i++) if (!used.has(`${i}-${i}`)) return `${i}-${i}`
}

// ── Перепланировка: метки демонтажа и новых элементов ────────────────────────
export class SetWallPhaseCommand implements Command {
  readonly kind = "set-wall-phase"
  readonly label: string
  private prev = new Map<string, "demolish" | "new" | undefined>()
  constructor(private floorId: string, private edgeIds: string[], private phase: "demolish" | "new" | undefined) {
    this.label = phase === "demolish" ? "демонтаж стены" : phase === "new" ? "новая стена" : "стена существующая"
  }
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (!f) return doc
    if (this.prev.size === 0) for (const id of this.edgeIds) if (f.wallGraph.edges[id]) this.prev.set(id, f.wallGraph.edges[id].phase)
    return mapFloor(doc, this.floorId, (fl) => {
      const edges = { ...fl.wallGraph.edges }
      for (const id of this.edgeIds) {
        if (!edges[id]) continue
        const { phase: _old, ...rest } = edges[id]
        edges[id] = this.phase ? { ...rest, phase: this.phase } : rest
      }
      return { ...fl, wallGraph: { ...fl.wallGraph, edges } }
    })
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => {
      const edges = { ...fl.wallGraph.edges }
      for (const [id, ph] of this.prev) {
        if (!edges[id]) continue
        const { phase: _old, ...rest } = edges[id]
        edges[id] = ph ? { ...rest, phase: ph } : rest
      }
      return { ...fl, wallGraph: { ...fl.wallGraph, edges } }
    })
  }
}

export class SetOpeningPhaseCommand implements Command {
  readonly kind = "set-opening-phase"
  readonly label = "проём: перепланировка"
  private prev?: "demolish" | "new" | undefined
  private captured = false
  constructor(private floorId: string, private openingId: string, private phase: "demolish" | "new" | undefined) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    const o = f?.openings.find((x) => x.id === this.openingId)
    if (o && !this.captured) { this.prev = o.phase; this.captured = true }
    return this.set(doc, this.phase)
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return this.set(doc, this.prev)
  }
  private set(doc: BuilderDocument, phase: "demolish" | "new" | undefined): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => ({
      ...fl,
      openings: fl.openings.map((o) => {
        if (o.id !== this.openingId) return o
        const { phase: _old, ...rest } = o
        return phase ? { ...rest, phase } : rest
      }),
    }))
  }
}

/**
 * Удаление в режиме перепланировки: новое удаляется по-настоящему,
 * существующее помечается под демонтаж, уже помеченное — не трогается.
 */
export function replanDeleteWall(doc: BuilderDocument, floorId: string, edgeId: string, replan: boolean): Command | null {
  const e = findFloor(doc, floorId)?.wallGraph.edges[edgeId]
  if (!e) return null
  if (!replan || e.phase === "new") return new DeleteWallCommand(floorId, edgeId)
  if (e.phase === "demolish") return null
  return new SetWallPhaseCommand(floorId, [edgeId], "demolish")
}

export function replanDeleteOpening(doc: BuilderDocument, floorId: string, openingId: string, replan: boolean): Command | null {
  const o = findFloor(doc, floorId)?.openings.find((x) => x.id === openingId)
  if (!o) return null
  if (!replan || o.phase === "new") return new DeleteOpeningCommand(floorId, openingId)
  if (o.phase === "demolish") return null
  return new SetOpeningPhaseCommand(floorId, openingId, "demolish")
}

// ── Групповые операции со стенами: сдвиг, копия, поворот, зеркало ─────────────
export class TransformWallsCommand implements Command {
  readonly kind = "transform-walls"
  readonly label: string
  private prev?: { wallGraph: WallGraph; openings: Opening[] }
  private result?: { wallGraph: WallGraph; openings: Opening[] }
  /** рёбра после операции — для нового выделения */
  createdIds: string[] = []
  constructor(private floorId: string, private edgeIds: string[], private xf: WallXf, private copy: boolean) {
    this.label = copy ? "копия стен" : xf.kind === "move" ? "сдвиг стен" : xf.kind === "rotate" ? "поворот стен" : "зеркало стен"
  }
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (!f) return doc
    if (!this.result) {
      this.prev = { wallGraph: f.wallGraph, openings: f.openings }
      const r = transformWalls(f, this.edgeIds, this.xf, this.copy)
      this.result = { wallGraph: r.wallGraph, openings: r.openings }
      this.createdIds = r.edgeIds
    }
    const res = this.result
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: res.wallGraph, openings: res.openings }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    const prev = this.prev
    if (!prev) return doc
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, wallGraph: prev.wallGraph, openings: prev.openings }))
  }
}

// ── Пометки на плане: размеры и надписи ──────────────────────────────────────
export class AddAnnotationCommand implements Command {
  readonly kind = "add-annotation"
  readonly label: string
  constructor(private floorId: string, private item: Annotation) {
    this.label = item.kind === "dim" ? "размер" : "надпись"
  }
  apply(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, annotations: [...(fl.annotations ?? []), this.item] }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, annotations: (fl.annotations ?? []).filter((x) => x.id !== this.item.id) }))
  }
}

export class DeleteAnnotationCommand implements Command {
  readonly kind = "delete-annotation"
  readonly label = "удаление пометки"
  private removed?: { item: Annotation; index: number }
  constructor(private floorId: string, private id: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const list = findFloor(doc, this.floorId)?.annotations ?? []
    const index = list.findIndex((x) => x.id === this.id)
    if (index >= 0) this.removed = { item: list[index], index }
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, annotations: (fl.annotations ?? []).filter((x) => x.id !== this.id) }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    const r = this.removed
    if (!r) return doc
    return mapFloor(doc, this.floorId, (fl) => {
      const list = [...(fl.annotations ?? [])]
      list.splice(Math.min(r.index, list.length), 0, r.item)
      return { ...fl, annotations: list }
    })
  }
}

export class UpdateAnnotationCommand implements Command {
  readonly kind = "update-annotation"
  readonly label = "пометка"
  private prev?: Annotation
  constructor(private floorId: string, private id: string, private props: { text?: string; offset?: number; at?: Vec2 }) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const cur = findFloor(doc, this.floorId)?.annotations?.find((x) => x.id === this.id)
    if (cur && !this.prev) this.prev = cur
    return mapFloor(doc, this.floorId, (fl) => ({
      ...fl,
      annotations: (fl.annotations ?? []).map((x) => {
        if (x.id !== this.id) return x
        if (x.kind === "dim") return { ...x, ...(this.props.offset !== undefined ? { offset: this.props.offset } : {}) }
        return { ...x, ...(this.props.text !== undefined ? { text: this.props.text } : {}), ...(this.props.at ? { at: this.props.at } : {}) }
      }),
    }))
  }
  revert(doc: BuilderDocument): BuilderDocument {
    const prev = this.prev
    if (!prev) return doc
    return mapFloor(doc, this.floorId, (fl) => ({ ...fl, annotations: (fl.annotations ?? []).map((x) => (x.id === this.id ? prev : x)) }))
  }
}

export class SetRoomNameCommand implements Command {
  readonly kind = "set-room-name"
  readonly label = "наименование помещения"
  private prev?: string
  private captured = false
  constructor(private floorId: string, private roomId: string, private name: string) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (f && !this.captured) { this.prev = f.roomNames?.[this.roomId]; this.captured = true }
    return this.set(doc, this.name)
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return this.set(doc, this.prev)
  }
  private set(doc: BuilderDocument, name: string | undefined): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => {
      const names = { ...(fl.roomNames ?? {}) }
      if (name) names[this.roomId] = name
      else delete names[this.roomId]
      return { ...fl, roomNames: names }
    })
  }
}

export class SetOpeningExitCommand implements Command {
  readonly kind = "set-opening-exit"
  readonly label = "назначение двери"
  private prev?: "main" | "emergency"
  private captured = false
  constructor(private floorId: string, private openingId: string, private exit: "main" | "emergency" | undefined) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const o = findFloor(doc, this.floorId)?.openings.find((x) => x.id === this.openingId)
    if (o && !this.captured) { this.prev = o.exit; this.captured = true }
    return this.set(doc, this.exit)
  }
  revert(doc: BuilderDocument): BuilderDocument {
    return this.set(doc, this.prev)
  }
  private set(doc: BuilderDocument, exit: "main" | "emergency" | undefined): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => ({
      ...fl,
      openings: fl.openings.map((o) => {
        if (o.id !== this.openingId) return o
        const { exit: _old, ...rest } = o
        return exit ? { ...rest, exit } : rest
      }),
    }))
  }
}

export class ToggleExitReverseCommand implements Command {
  readonly kind = "toggle-exit-reverse"
  readonly label = "стрелка выхода"
  constructor(private floorId: string, private openingId: string) {}
  private flip(doc: BuilderDocument): BuilderDocument {
    return mapFloor(doc, this.floorId, (fl) => ({
      ...fl,
      openings: fl.openings.map((o) => {
        if (o.id !== this.openingId) return o
        const { exitReverse, ...rest } = o
        return exitReverse ? rest : { ...rest, exitReverse: true }
      }),
    }))
  }
  apply(doc: BuilderDocument): BuilderDocument { return this.flip(doc) }
  revert(doc: BuilderDocument): BuilderDocument { return this.flip(doc) }
}

/**
 * Размер колонны. all — у всех колонн этажа сразу (один типоразмер), иначе только у этой.
 * Меняется только заданная сторона: у колонны без depth глубина фиксируется прежней.
 */
export function setColumnSizeCommand(floor: Floor, stairId: string, patch: { width?: number; depth?: number }, all: boolean): Command {
  const list = floor.stairs.filter((s) => s.shape === "column" && (all || s.id === stairId))
  return new CompositeCommand(all ? "размер всех колонн" : "размер колонны", list.map((s) => new SetStairCommand(floor.id, s.id, patch.width !== undefined && s.depth === undefined && patch.depth === undefined ? { ...patch, depth: s.width } : patch)))
}

/**
 * Назначение помещения (аренда / МОП / техническое). undefined — снова автоматически.
 * МОП и техническое — часть здания: привязка к карточке снимается (откат вернёт).
 */
export class SetRoomUseCommand implements Command {
  readonly kind = "set-room-use"
  readonly label = "назначение помещения"
  private prev?: { use?: "rent" | "common" | "tech"; link?: string }
  constructor(private floorId: string, private roomId: string, private use: "rent" | "common" | "tech" | undefined) {}
  apply(doc: BuilderDocument): BuilderDocument {
    const f = findFloor(doc, this.floorId)
    if (f && !this.prev) this.prev = { use: f.roomUse?.[this.roomId], link: f.premiseLinks[this.roomId] }
    return mapFloor(doc, this.floorId, (fl) => {
      const roomUse = { ...(fl.roomUse ?? {}) }
      if (this.use) roomUse[this.roomId] = this.use
      else delete roomUse[this.roomId]
      const premiseLinks = { ...fl.premiseLinks }
      if (this.use === "common" || this.use === "tech") delete premiseLinks[this.roomId]
      return { ...fl, roomUse, premiseLinks }
    })
  }
  revert(doc: BuilderDocument): BuilderDocument {
    const prev = this.prev
    return mapFloor(doc, this.floorId, (fl) => {
      const roomUse = { ...(fl.roomUse ?? {}) }
      if (prev?.use) roomUse[this.roomId] = prev.use
      else delete roomUse[this.roomId]
      const premiseLinks = { ...fl.premiseLinks }
      if (prev?.link) premiseLinks[this.roomId] = prev.link
      return { ...fl, roomUse, premiseLinks }
    })
  }
}
