// ADR: Все мутации документа — только команды (§6.2). Каждая команда хранит МИНИМАЛЬНУЮ
// инверсию (а не снапшот всего проекта): для графа стен — прежний граф этажа (локальный
// срез), для перемещения узла — прежние координаты, и т.д. Стек undo/redo ≥200, drag
// схлопывается в одну команду через merge. Команды — транспорт для AI Mode (Фаза 5).

import type { BuilderDocument, Floor, BuilderObject, RoofConfig, Building, Opening, Stair } from "@/types/builder"
import {
  type WallGraph,
  type WallDefaults,
  insertWall,
  moveNode as moveNodeGraph,
  removeEdge,
} from "@/core/geometry/wall-graph"
import type { Vec2 } from "@/core/geometry/math"

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
