// ADR: Жизненный цикл движка и пересборка сцены из документа (§4.1, §6.3). Фаза 2/3:
// рисование стен цепочкой со snap (узлы/сетка/угол 15°) и вводом длины с клавиатуры;
// перетаскивание узла (стены следуют); инструменты проёмов (реальные вырезы), лестниц
// (вырез в перекрытии), ведра материалов; ховер-outline. Один Engine, корректный dispose.

import {
  Camera,
  Color3,
  Matrix,
  Mesh,
  MeshBuilder,
  PointerEventTypes,
  TransformNode,
  UniversalCamera,
  Vector3,
  VertexBuffer,
} from "@babylonjs/core"
import { uid } from "@/core/id"
import type { BuilderDocument, Floor } from "@/types/builder"
import {
  findFloor,
  type Command,
  InsertWallCommand,
  DeleteWallCommand,
  AddRoomCommand,
  MoveWallCommand,
  AddObjectCommand,
  DeleteObjectCommand,
  MoveNodeCommand,
  MoveObjectCommand,
  AddOpeningCommand,
  DeleteOpeningCommand,
  AddStairCommand,
  DeleteStairCommand,
  SetWallMaterialCommand,
  SetRoomMaterialCommand,
  SetTerrainCommand,
} from "@/core/document/commands"
import { DEFAULT_WALL } from "@/core/geometry/wall-graph"
import { closestOnSegment, distance, snapToGrid, type Vec2 } from "@/core/geometry/math"
import { createScene, type SceneBundle } from "./create-scene"
import { MaterialRegistry } from "./material-registry"
import { buildWalls } from "./builders/wall-builder"
import { buildFloors, type StatusResolver } from "./builders/floor-builder"
import { buildRoof } from "./builders/roof-builder"
import { buildObject } from "./builders/object-builder"
import { buildStair, stairHoleWorld } from "./builders/stair-builder"
import type { CameraMode, DisplayMode, Selection, Tool } from "@/store/builder-store"

const S = 0.001
const ACCENT = Color3.FromHexString("#38BDF8")
const HOVER = Color3.FromHexString("#A78BFA")
const SNAP_NODE_MM = 300

const DOOR = { width: 900, height: 2100, sill: 0 }
const WINDOW = { width: 1200, height: 1400, sill: 900 }

export interface MeshMeta {
  kind: string
  floorId?: string
  entityId?: string
  target?: string
  areaMm2?: number
}

export interface RebuildContext {
  activeLevelId: string
  displayMode: DisplayMode
  wallsDown: boolean
}

export class BuilderEngine {
  private bundle: SceneBundle
  private reg: MaterialRegistry
  private docRoot: TransformNode | null = null
  private meshById = new Map<string, Mesh[]>()
  private walkCamera: UniversalCamera | null = null

  // инструмент стены
  private wallStart: Vector3 | null = null
  private lastDir: Vec2 = { x: 1, y: 0 }
  private lengthInput = ""
  private preview: Mesh | null = null
  private startMarker: Mesh | null = null

  // перетаскивание узла / объекта
  private dragNode: { floorId: string; nodeId: string } | null = null
  private dragObject: { target: { site: true } | { floorId: string }; objectId: string; planeY: number } | null = null
  private lastMoveAt = 0
  private hovered: Mesh | null = null

  // размещение объекта (placer) и рельеф
  private armedAsset: string | null = null
  private placerRot = 0
  private placerGhost: TransformNode | null = null
  private terrainHeights: number[] | null = null
  private terrainEditing = false
  private readonly groundSize = 60
  private readonly groundRes = 64

  // комната-прямоугольник / перемещение стены / орто-лок
  private roomStart: Vector3 | null = null
  private roomPreview: Mesh | null = null
  private dragWall: { floorId: string; edgeId: string; startMm: Vec2 } | null = null
  private shiftDown = false

  tool: Tool = "select"
  activeFloorId = ""
  paintMaterialId = "brick"
  openingType: "door" | "window" = "door"
  stairShape = "u"
  terrainMode: "raise" | "lower" | "flatten" | "smooth" = "raise"
  onPick: (meta: MeshMeta | null) => void = () => {}
  onCommand: (cmd: Command) => void = () => {}
  onHud: (text: string | null) => void = () => {}
  getDoc: () => BuilderDocument | null = () => null
  statusResolver: StatusResolver = () => undefined

  constructor(canvas: HTMLCanvasElement) {
    this.bundle = createScene(canvas)
    this.reg = new MaterialRegistry(this.bundle.scene)
    this.setupPointer()
    this.bundle.engine.runRenderLoop(() => this.bundle.scene.render())
  }

  // ── Пересборка сцены ───────────────────────────────────────────────────────
  rebuild(doc: BuilderDocument, ctx: RebuildContext): void {
    const scene = this.bundle.scene
    if (this.docRoot) this.docRoot.dispose()
    this.meshById.clear()
    this.hovered = null
    this.docRoot = new TransformNode("docRoot", scene)

    // Рельеф из документа (если правился кистями)
    if (!this.terrainEditing) this.applyHeightmap(doc.site.heightmap ?? null)

    const register = (id: string | undefined, mesh: Mesh) => {
      if (!id) return
      const arr = this.meshById.get(id) ?? []
      arr.push(mesh)
      this.meshById.set(id, arr)
    }

    const siteRoot = new TransformNode("siteRoot", scene)
    siteRoot.parent = this.docRoot
    for (const obj of doc.site.objects) {
      const node = buildObject(obj, siteRoot, scene, "site")
      node.getChildMeshes().forEach((m) => {
        if (m instanceof Mesh) {
          register(obj.id, m)
          this.bundle.shadow.addShadowCaster(m)
        }
      })
    }

    for (const b of doc.buildings) {
      const bRoot = new TransformNode(`b_${b.id}`, scene)
      bRoot.parent = this.docRoot
      bRoot.position.set(b.origin.x * S, 0, b.origin.y * S)
      const active = b.floors.find((f) => f.id === ctx.activeLevelId)

      for (const f of b.floors) {
        const fNode = new TransformNode(`f_${f.id}`, scene)
        fNode.parent = bRoot
        fNode.position.y = f.elevation * S

        // вырезы в перекрытии этого этажа от лестниц нижних этажей
        const holes: Vec2[][] = []
        for (const other of b.floors) {
          for (const st of other.stairs) {
            if (st.toFloorId === f.id) holes.push(stairHoleWorld(st, other.height))
          }
        }

        const walls = buildWalls(f, fNode, scene, this.reg)
        const floorMeshes = buildFloors(f, fNode, scene, this.reg, this.statusResolver, holes)
        for (const m of walls) {
          register(m.metadata?.entityId, m)
          this.bundle.shadow.addShadowCaster(m)
        }
        for (const m of floorMeshes) register(m.metadata?.entityId, m)

        for (const st of f.stairs) {
          const node = buildStair(st, f.height, fNode, scene, this.reg)
          node.getChildMeshes().forEach((m) => {
            if (m instanceof Mesh) {
              register(st.id, m)
              this.bundle.shadow.addShadowCaster(m)
            }
          })
        }

        const roof = buildRoof(f, bRoot, scene, this.reg)
        if (roof) {
          register(roof.metadata?.entityId, roof)
          this.bundle.shadow.addShadowCaster(roof)
        }

        // ручки узлов активного этажа (для перетаскивания)
        if (active && f.id === active.id) {
          for (const nid in f.wallGraph.nodes) {
            const n = f.wallGraph.nodes[nid]
            const handle = MeshBuilder.CreateSphere(`node_${nid}`, { diameter: 0.45, segments: 6 }, scene)
            handle.position.set(n.x * S, 0.12, n.y * S)
            handle.parent = fNode
            handle.material = this.reg.status("#38BDF8")
            handle.metadata = { kind: "node", floorId: f.id, entityId: nid }
            register(nid, handle)
          }
        }

        this.applyFloorVisibility(f, fNode, roof, ctx, active)
      }
    }
  }

  private applyFloorVisibility(f: Floor, fNode: TransformNode, roof: Mesh | null, ctx: RebuildContext, active: Floor | undefined): void {
    const setVis = (vis: number, enabled: boolean) => {
      fNode.setEnabled(enabled)
      if (roof) roof.setEnabled(enabled)
      fNode.getChildMeshes().forEach((m) => (m.visibility = vis))
      if (roof) roof.visibility = vis
    }
    if (!active || ctx.displayMode === "all") {
      setVis(f.visible ? f.opacity : 0, f.visible)
      return
    }
    if (ctx.displayMode === "active") {
      const on = f.id === active.id
      setVis(on ? 1 : 0, on)
      return
    }
    if (ctx.displayMode === "cutaway") {
      const on = f.level <= active.level
      setVis(on ? 1 : 0, on)
      return
    }
    if (f.level <= active.level) setVis(1, true)
    else setVis(0.18, true)
  }

  // ── Выделение / ховер ───────────────────────────────────────────────────────
  setSelection(sel: Selection): void {
    this.bundle.highlight.removeAllMeshes()
    if (sel.type !== "none" && sel.id) {
      for (const m of this.meshById.get(sel.id) ?? []) this.bundle.highlight.addMesh(m, ACCENT)
    }
  }

  private setHover(mesh: Mesh | null): void {
    if (this.hovered === mesh) return
    if (this.hovered) this.hovered.renderOutline = false
    this.hovered = mesh
    if (mesh) {
      mesh.renderOutline = true
      mesh.outlineColor = HOVER
      mesh.outlineWidth = 0.04
    }
  }

  // ── Камера ───────────────────────────────────────────────────────────────────
  setCameraMode(mode: CameraMode): void {
    const { scene, camera } = this.bundle
    const canvas = this.bundle.engine.getRenderingCanvas()
    if (mode === "walk") {
      if (!this.walkCamera) {
        const wc = new UniversalCamera("walk", new Vector3(0, 1.7, -16), scene)
        wc.minZ = 0.05
        wc.speed = 0.35
        wc.keysUp = [87]
        wc.keysDown = [83]
        wc.keysLeft = [65]
        wc.keysRight = [68]
        wc.checkCollisions = true
        wc.applyGravity = false
        wc.ellipsoid = new Vector3(0.4, 0.85, 0.4)
        scene.collisionsEnabled = true
        this.walkCamera = wc
      }
      camera.detachControl()
      scene.activeCamera = this.walkCamera
      if (canvas) this.walkCamera.attachControl(canvas, true)
      this.walkCamera.setTarget(new Vector3(0, 1.7, 0))
      this.enableWallCollisions()
      return
    }
    if (this.walkCamera) this.walkCamera.detachControl()
    scene.activeCamera = camera
    if (canvas) camera.attachControl(canvas, true)
    camera.mode = mode === "plan" ? Camera.ORTHOGRAPHIC_CAMERA : Camera.PERSPECTIVE_CAMERA
    camera.alpha = mode === "top" || mode === "plan" ? -Math.PI / 2 : -Math.PI / 4
    camera.beta = mode === "top" || mode === "plan" ? 0.02 : Math.PI / 3.2
    if (mode === "plan") {
      const r = camera.radius
      const aspect = this.bundle.engine.getAspectRatio(camera)
      camera.orthoTop = r * 0.5
      camera.orthoBottom = -r * 0.5
      camera.orthoLeft = -r * 0.5 * aspect
      camera.orthoRight = r * 0.5 * aspect
    }
  }

  private enableWallCollisions(): void {
    if (!this.docRoot) return
    this.docRoot.getChildMeshes().forEach((m) => {
      if (m instanceof Mesh && m.metadata?.kind === "wall") m.checkCollisions = true
    })
  }

  // ── Указатель ────────────────────────────────────────────────────────────────
  private setupPointer(): void {
    const scene = this.bundle.scene
    scene.onPointerObservable.add((pi) => {
      const ev = pi.event as { shiftKey?: boolean }
      this.shiftDown = !!ev?.shiftKey
      if (pi.type === PointerEventTypes.POINTERDOWN) this.handleDown()
      else if (pi.type === PointerEventTypes.POINTERMOVE) this.handleMove()
      else if (pi.type === PointerEventTypes.POINTERUP) this.handleUp()
      else if (pi.type === PointerEventTypes.POINTERTAP) this.handleTap()
    })
  }

  private pickMeta(): { meta: MeshMeta | null; point: Vector3 | null } {
    const { scene } = this.bundle
    const pick = scene.pick(scene.pointerX, scene.pointerY)
    return { meta: (pick?.pickedMesh?.metadata ?? null) as MeshMeta | null, point: pick?.pickedPoint ?? null }
  }

  private activeFloorPlaneY(): number {
    const doc = this.getDoc()
    if (!doc) return 0
    const f = findFloor(doc, this.activeFloorId)
    return f ? f.elevation * S : 0
  }

  private projectToPlane(): Vector3 | null {
    const { scene, camera } = this.bundle
    const cam = scene.activeCamera ?? camera
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, Matrix.Identity(), cam)
    const planeY = this.activeFloorPlaneY()
    if (Math.abs(ray.direction.y) < 1e-6) return null
    const t = (planeY - ray.origin.y) / ray.direction.y
    if (t < 0) return null
    return ray.origin.add(ray.direction.scale(t))
  }

  private nearestNodeMm(mmX: number, mmY: number): Vec2 | null {
    const doc = this.getDoc()
    const f = doc ? findFloor(doc, this.activeFloorId) : undefined
    if (!f) return null
    let best: Vec2 | null = null
    let bestD = SNAP_NODE_MM
    for (const id in f.wallGraph.nodes) {
      const n = f.wallGraph.nodes[id]
      const d = Math.hypot(n.x - mmX, n.y - mmY)
      if (d < bestD) {
        bestD = d
        best = { x: n.x, y: n.y }
      }
    }
    return best
  }

  // точка стены: snap к узлу, иначе угол 15° от старта + сетка 100мм
  private resolveWallPoint(world: Vector3): { mm: Vec2; world: Vector3 } {
    let mmX = world.x * 1000
    let mmY = world.z * 1000
    const node = this.nearestNodeMm(mmX, mmY)
    if (node) {
      mmX = node.x
      mmY = node.y
    } else if (this.wallStart) {
      const sx = this.wallStart.x * 1000
      const sy = this.wallStart.z * 1000
      const vx = mmX - sx
      const vy = mmY - sy
      const dist = Math.max(100, snapToGrid(Math.hypot(vx, vy), 100))
      // Shift — орто-лок (90°), иначе шаг 15°.
      const step = this.shiftDown ? Math.PI / 2 : Math.PI / 12
      const ang = Math.round(Math.atan2(vy, vx) / step) * step
      mmX = sx + Math.cos(ang) * dist
      mmY = sy + Math.sin(ang) * dist
    } else {
      mmX = snapToGrid(mmX, 100)
      mmY = snapToGrid(mmY, 100)
    }
    return { mm: { x: mmX, y: mmY }, world: new Vector3(mmX * S, this.activeFloorPlaneY() + 0.02, mmY * S) }
  }

  private handleDown(): void {
    if (this.tool === "terrain") {
      this.terrainEditing = true
      this.ensureTerrainHeights()
      this.bundle.scene.activeCamera?.detachControl()
      this.terrainBrush()
      return
    }
    if (this.tool === "room") {
      const p = this.projectToPlane()
      if (p && this.activeFloorId) {
        this.roomStart = new Vector3(snapToGrid(p.x * 1000, 100) * S, this.activeFloorPlaneY(), snapToGrid(p.z * 1000, 100) * S)
        this.bundle.scene.activeCamera?.detachControl()
      }
      return
    }
    if (this.tool === "select") {
      const { meta } = this.pickMeta()
      if (meta?.kind === "node" && meta.floorId && meta.entityId) {
        this.dragNode = { floorId: meta.floorId, nodeId: meta.entityId }
        this.bundle.scene.activeCamera?.detachControl()
      } else if (meta?.kind === "wall" && meta.floorId && meta.entityId) {
        const p = this.projectToPlane()
        if (p) {
          this.dragWall = { floorId: meta.floorId, edgeId: meta.entityId, startMm: { x: snapToGrid(p.x * 1000, 50), y: snapToGrid(p.z * 1000, 50) } }
          this.bundle.scene.activeCamera?.detachControl()
        }
      } else if (meta?.kind === "object" && meta.entityId) {
        const target = meta.target === "site" || !meta.target ? ({ site: true } as const) : ({ floorId: meta.target } as const)
        const planeY = "site" in target ? 0 : (findFloor(this.getDoc() ?? ({} as BuilderDocument), target.floorId)?.elevation ?? 0) * S
        this.dragObject = { target, objectId: meta.entityId, planeY }
        this.bundle.scene.activeCamera?.detachControl()
      }
    }
  }

  private handleMove(): void {
    if (this.terrainEditing) {
      this.terrainBrush()
      return
    }
    if (this.roomStart) {
      this.updateRoomPreview()
      return
    }
    if (this.dragWall) {
      const p = this.projectToPlane()
      if (!p) return
      const dx = snapToGrid(p.x * 1000, 50) - this.dragWall.startMm.x
      const dy = snapToGrid(p.z * 1000, 50) - this.dragWall.startMm.y
      const now = performance.now()
      if (now - this.lastMoveAt > 33) {
        this.lastMoveAt = now
        this.onCommand(new MoveWallCommand(this.dragWall.floorId, this.dragWall.edgeId, dx, dy))
      }
      return
    }
    if (this.dragNode) {
      const p = this.projectToPlane()
      if (!p) return
      const mmX = snapToGrid(p.x * 1000, 100)
      const mmY = snapToGrid(p.z * 1000, 100)
      const now = performance.now()
      if (now - this.lastMoveAt > 33) {
        this.lastMoveAt = now
        this.onCommand(new MoveNodeCommand(this.dragNode.floorId, this.dragNode.nodeId, { x: mmX, y: mmY }))
      }
      return
    }
    if (this.dragObject) {
      const p = this.projectToY(this.dragObject.planeY)
      if (!p) return
      const mmX = snapToGrid(p.x * 1000, 50)
      const mmZ = snapToGrid(p.z * 1000, 50)
      const now = performance.now()
      if (now - this.lastMoveAt > 33) {
        this.lastMoveAt = now
        this.onCommand(new MoveObjectCommand(this.dragObject.target, this.dragObject.objectId, mmX, mmZ))
      }
      return
    }
    if (this.tool === "object" && this.armedAsset) {
      this.updatePlacerGhost()
      return
    }
    if (this.tool === "wall" && this.wallStart) {
      const p = this.projectToPlane()
      if (p) this.updateWallPreview(this.resolveWallPoint(p))
      return
    }
    if (this.tool === "select" || this.tool === "material" || this.tool === "delete" || this.tool === "door" || this.tool === "window") {
      const { meta } = this.pickMeta()
      const id = meta?.entityId
      const mesh = id ? (this.meshById.get(id) ?? [])[0] ?? null : null
      this.setHover(mesh ?? null)
    }
  }

  private handleUp(): void {
    const canvas = this.bundle.engine.getRenderingCanvas()
    if (this.terrainEditing) {
      this.terrainEditing = false
      if (this.terrainHeights) this.onCommand(new SetTerrainCommand(this.terrainHeights))
      if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
      return
    }
    if (this.roomStart) {
      const p = this.projectToPlane()
      if (p && this.activeFloorId) {
        const x1 = Math.round(this.roomStart.x * 1000)
        const y1 = Math.round(this.roomStart.z * 1000)
        const x2 = snapToGrid(p.x * 1000, 100)
        const y2 = snapToGrid(p.z * 1000, 100)
        if (Math.abs(x2 - x1) >= 500 && Math.abs(y2 - y1) >= 500) {
          this.onCommand(new AddRoomCommand(this.activeFloorId, x1, y1, x2, y2, { thickness: 150, height: 3200, kind: "interior" }))
        }
      }
      this.roomStart = null
      this.roomPreview?.dispose()
      this.roomPreview = null
      if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
      return
    }
    if (this.dragWall) {
      const p = this.projectToPlane()
      if (p) {
        const dx = snapToGrid(p.x * 1000, 50) - this.dragWall.startMm.x
        const dy = snapToGrid(p.z * 1000, 50) - this.dragWall.startMm.y
        this.onCommand(new MoveWallCommand(this.dragWall.floorId, this.dragWall.edgeId, dx, dy))
      }
      this.dragWall = null
      if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
      return
    }
    if (this.dragNode) {
      const p = this.projectToPlane()
      if (p) {
        const mmX = snapToGrid(p.x * 1000, 100)
        const mmY = snapToGrid(p.z * 1000, 100)
        this.onCommand(new MoveNodeCommand(this.dragNode.floorId, this.dragNode.nodeId, { x: mmX, y: mmY }))
      }
      this.dragNode = null
      if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
      return
    }
    if (this.dragObject) {
      const p = this.projectToY(this.dragObject.planeY)
      if (p) this.onCommand(new MoveObjectCommand(this.dragObject.target, this.dragObject.objectId, snapToGrid(p.x * 1000, 50), snapToGrid(p.z * 1000, 50)))
      this.dragObject = null
      if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
    }
  }

  private handleTap(): void {
    if (this.dragNode || this.dragObject) return
    if (this.tool === "object" && this.armedAsset) {
      this.handlePlaceObject()
      return
    }
    if (this.tool === "wall") {
      this.handleWallTap()
      return
    }
    const { meta, point } = this.pickMeta()
    if (this.tool === "door" || this.tool === "window") {
      this.handleOpeningTap(meta, point)
      return
    }
    if (this.tool === "stair") {
      this.handleStairTap()
      return
    }
    if (this.tool === "material") {
      this.handlePaintTap(meta)
      return
    }
    if (this.tool === "delete") {
      this.handleDelete(meta)
      return
    }
    if (meta?.kind === "node") {
      this.onPick(null)
      return
    }
    this.onPick(meta && meta.entityId ? meta : null)
  }

  // ── Стена (цепочка) ────────────────────────────────────────────────────────
  isDrawingWall(): boolean {
    return this.tool === "wall" && this.wallStart !== null
  }

  private handleWallTap(): void {
    if (!this.activeFloorId) return
    const p = this.projectToPlane()
    if (!p) return
    const r = this.resolveWallPoint(p)
    if (!this.wallStart) {
      this.wallStart = r.world
      this.showStartMarker(r.world)
      return
    }
    this.commitWall(r.mm)
  }

  private commitWall(end: Vec2): void {
    if (!this.wallStart) return
    const fromX = snapToGrid(this.wallStart.x * 1000, 1)
    const fromY = snapToGrid(this.wallStart.z * 1000, 1)
    if (Math.hypot(end.x - fromX, end.y - fromY) >= 100) {
      this.onCommand(new InsertWallCommand(this.activeFloorId, { x: fromX, y: fromY }, end, DEFAULT_WALL))
      // цепочка: продолжаем от конечной точки
      this.wallStart = new Vector3(end.x * S, this.activeFloorPlaneY() + 0.02, end.y * S)
      this.showStartMarker(this.wallStart)
    }
    this.lengthInput = ""
    this.onHud(null)
  }

  // ввод длины с клавиатуры (вызывается из BuilderApp, чтобы не конфликтовать с хоткеями)
  handleLengthKey(key: string): void {
    if (!this.isDrawingWall()) return
    if (key === "Enter") {
      const len = parseFloat(this.lengthInput.replace(",", "."))
      if (Number.isFinite(len) && len > 0 && this.wallStart) {
        const sx = this.wallStart.x * 1000
        const sy = this.wallStart.z * 1000
        const lenMm = len * 1000
        this.commitWall({ x: snapToGrid(sx + this.lastDir.x * lenMm, 1), y: snapToGrid(sy + this.lastDir.y * lenMm, 1) })
      }
      return
    }
    if (key === "Backspace") this.lengthInput = this.lengthInput.slice(0, -1)
    else if (/^[0-9]$/.test(key) || key === ",") this.lengthInput += key
    this.onHud(this.lengthInput ? `${this.lengthInput} м` : null)
  }

  private updateWallPreview(r: { mm: Vec2; world: Vector3 }): void {
    if (!this.wallStart) return
    const a = this.wallStart
    const b = r.world
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    if (len > 0.01) this.lastDir = { x: dx / len, y: dz / len }
    this.preview?.dispose()
    if (len < 0.05) return
    const box = MeshBuilder.CreateBox("wallPreview", { width: len, depth: 0.2, height: 3 }, this.bundle.scene)
    box.position.set((a.x + b.x) / 2, this.activeFloorPlaneY() + 1.5, (a.z + b.z) / 2)
    box.rotation.y = -Math.atan2(dz, dx)
    box.isPickable = false
    box.visibility = 0.4
    box.material = this.reg.status("#38BDF8")
    this.preview = box
    if (!this.lengthInput) this.onHud(`${len.toFixed(2)} м`)
  }

  private showStartMarker(world: Vector3): void {
    this.startMarker?.dispose()
    const m = MeshBuilder.CreateSphere("wallStart", { diameter: 0.35 }, this.bundle.scene)
    m.position.copyFrom(world)
    m.isPickable = false
    m.material = this.reg.status("#38BDF8")
    this.startMarker = m
  }

  cancelWallTool(): void {
    this.wallStart = null
    this.lengthInput = ""
    this.preview?.dispose()
    this.preview = null
    this.startMarker?.dispose()
    this.startMarker = null
    this.onHud(null)
  }

  // ── Проёмы ───────────────────────────────────────────────────────────────────
  private handleOpeningTap(meta: MeshMeta | null, point: Vector3 | null): void {
    if (meta?.kind === "opening" && meta.floorId && meta.entityId) {
      this.onPick(meta)
      return
    }
    if (!meta || meta.kind !== "wall" || !meta.floorId || !meta.entityId || !point) return
    const doc = this.getDoc()
    const f = doc ? findFloor(doc, meta.floorId) : undefined
    const e = f?.wallGraph.edges[meta.entityId]
    if (!f || !e) return
    const a = f.wallGraph.nodes[e.a]
    const b = f.wallGraph.nodes[e.b]
    const pMm = { x: point.x * 1000, y: point.z * 1000 }
    const c = closestOnSegment(pMm, { x: a.x, y: a.y }, { x: b.x, y: b.y })
    const len = distance({ x: a.x, y: a.y }, { x: b.x, y: b.y })
    const spec = this.openingType === "window" ? WINDOW : DOOR
    const offset = Math.max(spec.width / 2 + 50, Math.min(len - spec.width / 2 - 50, c.t * len))
    if (len < spec.width + 200) return
    this.onCommand(
      new AddOpeningCommand(meta.floorId, {
        id: uid("op"),
        wallId: meta.entityId,
        type: this.openingType,
        width: spec.width,
        height: spec.height,
        sillHeight: spec.sill,
        offset,
      }),
    )
  }

  // ── Лестница ──────────────────────────────────────────────────────────────────
  private handleStairTap(): void {
    const doc = this.getDoc()
    const f = doc ? findFloor(doc, this.activeFloorId) : undefined
    if (!f || !doc) return
    const building = doc.buildings.find((bd) => bd.floors.some((fl) => fl.id === f.id))
    const upper = building?.floors.find((fl) => fl.level === f.level + 1)
    const p = this.projectToPlane()
    if (!p) return
    this.onCommand(
      new AddStairCommand(f.id, {
        id: uid("st"),
        shape: this.stairShape as "straight" | "l" | "u" | "spiral",
        fromFloorId: f.id,
        toFloorId: upper?.id ?? f.id,
        position: { x: snapToGrid(p.x * 1000, 100), y: snapToGrid(p.z * 1000, 100) },
        rotationDeg: 0,
        width: 1100,
        railing: true,
      }),
    )
  }

  // ── Ведро ────────────────────────────────────────────────────────────────────
  private handlePaintTap(meta: MeshMeta | null): void {
    if (!meta || !meta.floorId || !meta.entityId) return
    if (meta.kind === "wall") this.onCommand(new SetWallMaterialCommand(meta.floorId, meta.entityId, this.paintMaterialId))
    else if (meta.kind === "room") this.onCommand(new SetRoomMaterialCommand(meta.floorId, meta.entityId, this.paintMaterialId))
  }

  // ── Удаление ────────────────────────────────────────────────────────────────
  private handleDelete(meta: MeshMeta | null): void {
    if (!meta || !meta.entityId) return
    if (meta.kind === "wall" && meta.floorId) this.onCommand(new DeleteWallCommand(meta.floorId, meta.entityId))
    else if (meta.kind === "opening" && meta.floorId) this.onCommand(new DeleteOpeningCommand(meta.floorId, meta.entityId))
    else if (meta.kind === "stair" && meta.floorId) this.onCommand(new DeleteStairCommand(meta.floorId, meta.entityId))
    else if (meta.kind === "object") {
      const target = meta.target === "site" ? ({ site: true } as const) : ({ floorId: meta.target ?? "" } as const)
      this.onCommand(new DeleteObjectCommand(target, meta.entityId))
    }
  }

  // ── Предпросмотр комнаты ──────────────────────────────────────────────────────
  private updateRoomPreview(): void {
    if (!this.roomStart) return
    const p = this.projectToPlane()
    if (!p) return
    const x1 = this.roomStart.x
    const z1 = this.roomStart.z
    const x2 = snapToGrid(p.x * 1000, 100) * S
    const z2 = snapToGrid(p.z * 1000, 100) * S
    const w = Math.abs(x2 - x1)
    const d = Math.abs(z2 - z1)
    this.roomPreview?.dispose()
    if (w < 0.4 || d < 0.4) {
      this.onHud(null)
      return
    }
    const box = MeshBuilder.CreateBox("roomPreview", { width: w, depth: d, height: 0.1 }, this.bundle.scene)
    box.position.set((x1 + x2) / 2, this.activeFloorPlaneY() + 0.05, (z1 + z2) / 2)
    box.isPickable = false
    box.visibility = 0.4
    box.material = this.reg.status("#38BDF8")
    this.roomPreview = box
    this.onHud(`${w.toFixed(1)} × ${d.toFixed(1)} м`)
  }

  // ── Проекция на произвольную высоту ──────────────────────────────────────────
  private projectToY(planeY: number): Vector3 | null {
    const { scene, camera } = this.bundle
    const cam = scene.activeCamera ?? camera
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, Matrix.Identity(), cam)
    if (Math.abs(ray.direction.y) < 1e-6) return null
    const t = (planeY - ray.origin.y) / ray.direction.y
    if (t < 0) return null
    return ray.origin.add(ray.direction.scale(t))
  }

  // ── Рельеф (кисти) ───────────────────────────────────────────────────────────
  private applyHeightmap(heights: number[] | null): void {
    const ground = this.bundle.ground
    const positions = ground.getVerticesData(VertexBuffer.PositionKind)
    if (!positions) return
    const vCount = positions.length / 3
    for (let i = 0; i < vCount; i++) positions[i * 3 + 1] = heights && i < heights.length ? heights[i] : 0
    ground.updateVerticesData(VertexBuffer.PositionKind, positions)
    ground.refreshBoundingInfo()
  }

  private ensureTerrainHeights(): void {
    if (this.terrainHeights) return
    const positions = this.bundle.ground.getVerticesData(VertexBuffer.PositionKind)
    const vCount = positions ? positions.length / 3 : 0
    const doc = this.getDoc()
    if (doc?.site.heightmap && doc.site.heightmap.length === vCount) this.terrainHeights = [...doc.site.heightmap]
    else this.terrainHeights = new Array(vCount).fill(0)
  }

  private terrainBrush(): void {
    if (!this.terrainHeights) return
    const scene = this.bundle.scene
    const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === this.bundle.ground)
    const hit = pick?.pickedPoint
    if (!hit) return
    const positions = this.bundle.ground.getVerticesData(VertexBuffer.PositionKind)
    if (!positions) return
    const radius = 4
    const strength = 0.25
    for (let i = 0; i < this.terrainHeights.length; i++) {
      const x = positions[i * 3]
      const z = positions[i * 3 + 2]
      const d = Math.hypot(x - hit.x, z - hit.z)
      if (d > radius) continue
      const fall = 1 - d / radius
      let h = this.terrainHeights[i]
      if (this.terrainMode === "raise") h += strength * fall
      else if (this.terrainMode === "lower") h -= strength * fall
      else if (this.terrainMode === "flatten") h += (hit.y - h) * fall * 0.5
      else h += (hit.y - h) * fall * 0.25
      this.terrainHeights[i] = h
      positions[i * 3 + 1] = h
    }
    this.bundle.ground.updateVerticesData(VertexBuffer.PositionKind, positions)
    this.bundle.ground.refreshBoundingInfo()
  }

  // ── Размещение объекта (placer) ──────────────────────────────────────────────
  setArmedAsset(assetId: string | null): void {
    this.armedAsset = assetId
    this.placerRot = 0
    if (!assetId) this.cancelPlacer()
  }

  rotatePlacer(deg: number): void {
    this.placerRot = (this.placerRot + deg) % 360
    if (this.placerGhost) this.placerGhost.rotation.y = (this.placerRot * Math.PI) / 180
  }

  private buildGhost(assetId: string): TransformNode {
    const container = new TransformNode("ghost", this.bundle.scene)
    buildObject({ id: "ghost", assetId, position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1, attachTo: "terrain", locked: false }, container, this.bundle.scene, "ghost")
    container.getChildMeshes().forEach((m) => {
      m.isPickable = false
      m.visibility = 0.5
    })
    container.metadata = { asset: assetId }
    return container
  }

  private updatePlacerGhost(): void {
    if (!this.armedAsset) return
    const p = this.projectToPlane()
    if (!p) return
    if (!this.placerGhost || this.placerGhost.metadata?.asset !== this.armedAsset) {
      this.placerGhost?.dispose()
      this.placerGhost = this.buildGhost(this.armedAsset)
    }
    this.placerGhost.position.set(p.x, this.activeFloorPlaneY(), p.z)
    this.placerGhost.rotation.y = (this.placerRot * Math.PI) / 180
  }

  private cancelPlacer(): void {
    this.placerGhost?.dispose()
    this.placerGhost = null
  }

  private handlePlaceObject(): void {
    if (!this.armedAsset) return
    const p = this.projectToPlane()
    if (!p) return
    const doc = this.getDoc()
    const onFloor = doc ? findFloor(doc, this.activeFloorId) : undefined
    const target = onFloor ? ({ floorId: this.activeFloorId } as const) : ({ site: true } as const)
    this.onCommand(
      new AddObjectCommand(target, {
        id: uid("o"),
        assetId: this.armedAsset,
        position: { x: snapToGrid(p.x * 1000, 50), y: 0, z: snapToGrid(p.z * 1000, 50) },
        rotationY: this.placerRot,
        scale: 1,
        attachTo: "terrain",
        locked: false,
      }),
    )
  }

  resize(): void {
    this.bundle.engine.resize()
  }

  dispose(): void {
    this.cancelWallTool()
    this.cancelPlacer()
    this.roomPreview?.dispose()
    this.bundle.engine.stopRenderLoop()
    this.reg.dispose()
    this.bundle.scene.dispose()
    this.bundle.engine.dispose()
  }
}
