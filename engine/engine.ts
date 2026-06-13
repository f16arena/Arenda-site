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
  PointLight,
  PointerEventTypes,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  Vector3,
  VertexBuffer,
} from "@babylonjs/core"
import { uid } from "@/core/id"
import type { BuilderDocument, Floor, Building, Stair } from "@/types/builder"
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
  SetObjectRotationCommand,
  AddOpeningCommand,
  DeleteOpeningCommand,
  MoveOpeningCommand,
  AddStairCommand,
  DeleteStairCommand,
  MoveStairCommand,
  SetWallMaterialCommand,
  SetRoomMaterialCommand,
  SetTerrainCommand,
  AddWaterCommand,
  DeleteWaterCommand,
  AddPathCommand,
  DeletePathCommand,
  AddPavementCommand,
  DeletePavementCommand,
} from "@/core/document/commands"
import { DEFAULT_WALL } from "@/core/geometry/wall-graph"
import { centroid, closestOnSegment, distance, pointInPolygon, snapToGrid, type Vec2 } from "@/core/geometry/math"
import { detectRooms } from "@/core/geometry/room-detection"
import { findPreset } from "@/lib/builder/openings"
import { createScene, type SceneBundle } from "./create-scene"
import { MaterialRegistry } from "./material-registry"
import { buildWalls } from "./builders/wall-builder"
import { buildFloors, type StatusResolver } from "./builders/floor-builder"
import { buildRoof } from "./builders/roof-builder"
import { buildObject } from "./builders/object-builder"
import { buildStair, stairHoleWorld } from "./builders/stair-builder"
import { buildWater } from "./builders/water-builder"
import { buildPath } from "./builders/path-builder"
import { buildPavement } from "./builders/pavement-builder"
import { LIGHT_ASSETS } from "./builders/object-builder"
import { GizmoController, type GizmoMode } from "./gizmo"
import type { CameraMode, DisplayMode, Selection, Tool } from "@/store/builder-store"

const S = 0.001
const ACCENT = Color3.FromHexString("#38BDF8")
const HOVER = Color3.FromHexString("#A78BFA")
const SNAP_NODE_MM = 300

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
  private lights: PointLight[] = []
  private readonly maxLights = 8
  private gizmo: GizmoController
  private objectRootById = new Map<string, TransformNode>()
  // Габариты объектов в плане (мм, мировые AABB) — для запрета наложения объектов.
  private objectFootprints = new Map<string, { target: string; minX: number; maxX: number; minZ: number; maxZ: number }>()
  // Базовый габарит ассета (мм) при scale=1, rotation=0 — для ввода размеров в метрах.
  private assetBaseSize = new Map<string, { w: number; d: number; h: number }>()
  private currentSel: Selection | null = null
  private currentMulti: string[] = [] // id объектов в мультивыборе
  private openDoors = new Set<string>() // двери, открытые кликом в Walk
  gizmoMode: GizmoMode = "move"

  // Перф: ссылки на корни для адресной (поэтажной) пересборки и живого drag-оверлея.
  private buildingRootById = new Map<string, TransformNode>()
  private floorRootById = new Map<string, TransformNode>()
  private roofByFloorId = new Map<string, Mesh>()
  private lastCtx: RebuildContext | null = null
  private dragOverlay: { fNode: TransformNode; roof: Mesh | null } | null = null
  private dragFloorId: string | null = null
  private lastHoverAt = 0

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

  // вода по контуру (сплайн)
  private waterPoints: Vec2[] = [] // мм
  private waterPreview: TransformNode | null = null

  // линии по сплайну (дорога/дорожка/забор)
  private pathPoints: Vec2[] = [] // мм
  private pathPreview: TransformNode | null = null

  // площадка-покрытие по контуру
  private pavePoints: Vec2[] = [] // мм
  private pavePreview: TransformNode | null = null

  // комната-прямоугольник / перемещение стены / орто-лок
  private roomStart: Vector3 | null = null
  private roomPreview: Mesh | null = null
  private dragWall: { floorId: string; edgeId: string; startMm: Vec2 } | null = null
  private dragOpening: { floorId: string; openingId: string } | null = null
  private dragStair: { floorId: string; stairId: string } | null = null
  private shiftDown = false

  tool: Tool = "select"
  activeFloorId = ""
  paintMaterialId = "brick"
  openingType: "door" | "window" = "door"
  openingVariant = "interior"
  stairShape = "u"
  terrainMode: "raise" | "lower" | "flatten" | "smooth" | "terrace" = "raise"
  waterDepth = 800 // мм, глубина прокопа русла
  pathKind: "road" | "path" | "fence" = "road"
  pathWidth = 3000 // мм, ширина дороги/дорожки
  fenceStyle: "profnastil" | "shtaketnik" | "mesh" | "forged" | "wood" = "profnastil"
  paveMaterial = "asphalt"
  onPick: (meta: MeshMeta | null) => void = () => {}
  onMultiToggle: (objectId: string) => void = () => {}
  onLinkRoom: (floorId: string, roomId: string) => void = () => {}
  onCommand: (cmd: Command) => void = () => {}
  onHud: (text: string | null) => void = () => {}
  onObjectBaseSizes: (sizes: Record<string, { w: number; d: number; h: number }>) => void = () => {}
  getDoc: () => BuilderDocument | null = () => null
  statusResolver: StatusResolver = () => undefined

  constructor(canvas: HTMLCanvasElement) {
    this.bundle = createScene(canvas)
    this.reg = new MaterialRegistry(this.bundle.scene)
    this.gizmo = new GizmoController(this.bundle.scene)
    this.gizmo.onChange = ({ x, z, rotationYDeg }) => {
      const sel = this.currentSel
      if (!sel || sel.type !== "object" || !sel.id) return
      const target = sel.floorId ? ({ floorId: sel.floorId } as const) : ({ site: true } as const)
      if (this.gizmoMode === "rotate") {
        this.onCommand(new SetObjectRotationCommand(target, sel.id, rotationYDeg))
        return
      }
      // Перемещение гизмо: проверяем наложение, при конфликте — откат на место.
      const cx = Math.round(x * 1000)
      const cz = Math.round(z * 1000)
      const targetKey = sel.floorId ?? "site"
      const node = this.objectRootById.get(sel.id)
      const half = node ? this.nodeHalfExtents(node) : { hx: 300, hz: 300 }
      const box = { minX: cx - half.hx, maxX: cx + half.hx, minZ: cz - half.hz, maxZ: cz + half.hz }
      if (this.overlapsExisting(targetKey, box, sel.id)) {
        const orig = this.findObjectPos(target, sel.id)
        if (node && orig) node.setAbsolutePosition(new Vector3(orig.x * S, node.getAbsolutePosition().y, orig.z * S))
        this.onHud("Нельзя ставить объект на объект")
        return
      }
      this.onCommand(new MoveObjectCommand(target, sel.id, cx, cz))
    }
    this.setupPointer()
    this.bundle.engine.runRenderLoop(() => this.bundle.scene.render())
  }

  getFps(): number {
    return this.bundle.engine.getFps()
  }

  // Турбо-режим (§24): рендер в пониженном разрешении (меньше пикселей — выше FPS) и
  // более лёгкие тени. Геометрия и интерактив не меняются.
  setTurbo(on: boolean): void {
    this.bundle.engine.setHardwareScalingLevel(on ? 1.4 : 1)
    this.bundle.shadow.useBlurExponentialShadowMap = !on
    this.bundle.scene.fogEnabled = !on
  }

  setGizmoMode(mode: GizmoMode): void {
    this.gizmoMode = mode
    if (this.currentSel?.type === "object" && this.currentSel.id) {
      this.gizmo.attach(this.objectRootById.get(this.currentSel.id) ?? null)
      this.gizmo.setMode(mode)
    } else {
      this.gizmo.setMode("none")
    }
  }

  private registerMesh(id: string | undefined, mesh: Mesh): void {
    if (!id) return
    const arr = this.meshById.get(id) ?? []
    arr.push(mesh)
    this.meshById.set(id, arr)
  }

  // ── Пересборка сцены ───────────────────────────────────────────────────────
  rebuild(doc: BuilderDocument, ctx: RebuildContext): void {
    const scene = this.bundle.scene
    this.lastCtx = ctx
    if (this.docRoot) this.docRoot.dispose()
    this.dragOverlay = null // оверлей жил под docRoot — уже освобождён вместе с ним
    this.dragFloorId = null
    for (const l of this.lights) l.dispose()
    this.lights = []
    this.meshById.clear()
    this.objectRootById.clear()
    this.objectFootprints.clear()
    this.buildingRootById.clear()
    this.floorRootById.clear()
    this.roofByFloorId.clear()
    this.hovered = null
    this.docRoot = new TransformNode("docRoot", scene)
    const lightSpecs: Vector3[] = []

    // Рельеф из документа (если правился кистями) + котлованы под цоколь/подвал
    if (!this.terrainEditing) {
      this.applyHeightmap(doc.site.heightmap ?? null)
      this.excavateBasements(doc)
      this.updateGroundSplat()
    }

    const siteRoot = new TransformNode("siteRoot", scene)
    siteRoot.parent = this.docRoot
    for (const obj of doc.site.objects) {
      const node = buildObject(obj, siteRoot, scene, "site")
      this.objectRootById.set(obj.id, node)
      node.getChildMeshes().forEach((m) => {
        if (m instanceof Mesh) {
          this.registerMesh(obj.id, m)
          this.bundle.shadow.addShadowCaster(m)
        }
      })
      this.recordFootprint(obj.id, "site", node)
      if (LIGHT_ASSETS.has(obj.assetId)) lightSpecs.push(new Vector3(obj.position.x * S, obj.position.y * S + 2.6, obj.position.z * S))
    }

    // Водоёмы по контуру (вода по сплайну).
    for (const w of doc.site.water ?? []) {
      const mesh = buildWater(w, siteRoot, scene, this.reg)
      if (mesh) this.registerMesh(w.id, mesh)
    }

    // Линии по сплайну: дороги/дорожки/заборы.
    for (const pth of doc.site.paths ?? []) {
      for (const m of buildPath(pth, siteRoot, scene, this.reg)) {
        this.registerMesh(pth.id, m)
        if (pth.kind === "fence") this.bundle.shadow.addShadowCaster(m)
      }
    }

    // Площадки-покрытия по контуру.
    for (const pav of doc.site.pavements ?? []) {
      const mesh = buildPavement(pav, siteRoot, scene, this.reg)
      if (mesh) this.registerMesh(pav.id, mesh)
    }

    for (const b of doc.buildings) {
      const bRoot = new TransformNode(`b_${b.id}`, scene)
      bRoot.parent = this.docRoot
      bRoot.position.set(b.origin.x * S, 0, b.origin.y * S)
      this.buildingRootById.set(b.id, bRoot)
      const active = b.floors.find((f) => f.id === ctx.activeLevelId)
      for (const f of b.floors) {
        this.buildFloorMeshes(doc, b, bRoot, f, ctx, active, { register: true, lightSpecs })
      }
    }

    // Источники света — лимит maxLights (приоритет: первые в документе), чтобы не
    // ронять FPS. Светятся также через emissive+GlowLayer независимо от лимита.
    for (const pos of lightSpecs.slice(0, this.maxLights)) {
      const pl = new PointLight(`pl_${pos.x}_${pos.z}`, pos, scene)
      pl.intensity = 0.35
      pl.range = 14
      pl.diffuse = new Color3(1, 0.96, 0.85)
      this.lights.push(pl)
    }

    // Открытые ранее двери (Walk) — прячем их створки после пересборки.
    for (const id of this.openDoors) {
      for (const m of this.meshById.get(id) ?? []) m.visibility = 0
    }

    this.freezeStatics()
    this.refreshShadows()
    this.emitBaseSizes(doc)
  }

  // Строит меши одного этажа в свой TransformNode (под bRoot). register:true — полная
  // пересборка (регистрация для пикинга/тени/света). register:false — визуальный оверлей
  // для живого drag (без пикинга/тени), используется previewFloorDrag().
  private buildFloorMeshes(
    doc: BuilderDocument,
    b: Building,
    bRoot: TransformNode,
    f: Floor,
    ctx: RebuildContext,
    active: Floor | undefined,
    opts: { register: boolean; lightSpecs?: Vector3[] },
  ): { fNode: TransformNode; roof: Mesh | null } {
    const scene = this.bundle.scene
    const reg = opts.register
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
    if (reg) {
      for (const m of walls) {
        this.registerMesh(m.metadata?.entityId, m)
        this.bundle.shadow.addShadowCaster(m)
      }
      for (const m of floorMeshes) this.registerMesh(m.metadata?.entityId, m)
    }

    for (const st of f.stairs) {
      const node = buildStair(st, f.height, fNode, scene, this.reg)
      if (reg) {
        node.getChildMeshes().forEach((m) => {
          if (m instanceof Mesh) {
            this.registerMesh(st.id, m)
            this.bundle.shadow.addShadowCaster(m)
          }
        })
      }
    }

    // объекты на этаже (мебель/техника/свет/декор)
    for (const obj of f.objects) {
      const node = buildObject(obj, fNode, scene, f.id)
      if (reg) {
        this.objectRootById.set(obj.id, node)
        node.getChildMeshes().forEach((m) => {
          if (m instanceof Mesh) {
            this.registerMesh(obj.id, m)
            this.bundle.shadow.addShadowCaster(m)
          }
        })
        this.recordFootprint(obj.id, f.id, node)
        if (LIGHT_ASSETS.has(obj.assetId)) opts.lightSpecs?.push(new Vector3(b.origin.x * S + obj.position.x * S, f.elevation * S + obj.position.y * S + 2.6, b.origin.y * S + obj.position.z * S))
      }
    }

    const roof = buildRoof(f, bRoot, scene, this.reg)
    if (roof && reg) {
      this.registerMesh(roof.metadata?.entityId, roof)
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
        handle.isPickable = reg
        if (reg) this.registerMesh(nid, handle)
      }
    }

    this.applyFloorVisibility(f, fNode, roof, ctx, active)
    if (reg) {
      this.floorRootById.set(f.id, fNode)
      if (roof) this.roofByFloorId.set(f.id, roof)
    }
    return { fNode, roof }
  }

  // Перф (§24): мировые матрицы статичных мешей замораживаем (стены/полы/крыши/лестницы/
  // вода/дороги) — любая правка идёт через пересборку. Объекты не трогаем (живой drag/гизмо).
  private freezeStatics(): void {
    for (const [id, arr] of this.meshById) {
      if (this.objectRootById.has(id)) continue
      for (const m of arr) {
        m.freezeWorldMatrix()
        m.doNotSyncBoundingInfo = true
      }
    }
  }

  // Перф (§24): карта теней статична между правками (refreshRate = RENDER_ONCE) — после
  // пересборки даём ей перерисоваться один раз, иначе тени не пересчитываются каждый кадр.
  private refreshShadows(): void {
    this.bundle.shadow.getShadowMap()?.resetRefreshCounter()
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
  setMulti(ids: string[]): void {
    this.currentMulti = ids
    this.applyHighlight()
  }

  private applyHighlight(): void {
    this.bundle.highlight.removeAllMeshes()
    const sel = this.currentSel
    if (sel && sel.type !== "none" && sel.id) {
      for (const m of this.meshById.get(sel.id) ?? []) this.bundle.highlight.addMesh(m, ACCENT)
    }
    for (const id of this.currentMulti) {
      for (const m of this.meshById.get(id) ?? []) this.bundle.highlight.addMesh(m, HOVER)
    }
  }

  setSelection(sel: Selection): void {
    this.currentSel = sel
    this.applyHighlight()
    // Gizmo перемещения/поворота — только для объектов.
    if (sel.type === "object" && sel.id && this.objectRootById.has(sel.id)) {
      this.gizmo.attach(this.objectRootById.get(sel.id) ?? null)
      this.gizmo.setMode(this.gizmoMode)
    } else {
      this.gizmo.attach(null)
      this.gizmo.setMode("none")
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

  // Поворот орбитальной камеры к заданному ракурсу (ViewCube). Возврат к перспективе.
  orbitTo(alpha: number, beta: number): void {
    const { scene, camera } = this.bundle
    const canvas = this.bundle.engine.getRenderingCanvas()
    if (this.walkCamera) this.walkCamera.detachControl()
    scene.activeCamera = camera
    if (canvas) camera.attachControl(canvas, true)
    camera.mode = Camera.PERSPECTIVE_CAMERA
    camera.alpha = alpha
    camera.beta = beta
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

  // ── Живой drag без пересборки документа (перф) ───────────────────────────────
  // При старте drag прячем «настоящий» этаж и показываем визуальный оверлей, который
  // дёшево перестраивается на каждое движение через previewFloorDrag(). Команда в стор
  // уходит ОДИН раз на отпускании — нет churn'а React/геометрии всей сцены 30×/сек.
  private beginFloorDrag(floorId: string): void {
    this.dragFloorId = floorId
    this.floorRootById.get(floorId)?.setEnabled(false)
    this.roofByFloorId.get(floorId)?.setEnabled(false)
  }

  private endFloorDrag(): void {
    if (this.dragOverlay) {
      this.dragOverlay.fNode.dispose()
      this.dragOverlay.roof?.dispose()
      this.dragOverlay = null
    }
    if (this.dragFloorId) {
      this.floorRootById.get(this.dragFloorId)?.setEnabled(true)
      this.roofByFloorId.get(this.dragFloorId)?.setEnabled(true)
      this.dragFloorId = null
    }
  }

  // Применяет команду к клону документа (без записи в стор) и перестраивает ТОЛЬКО
  // затронутый этаж как визуальный оверлей. На отпускании handleUp шлёт настоящую команду.
  private previewFloorDrag(floorId: string, cmd: Command): void {
    const doc = this.getDoc()
    if (!doc || !this.lastCtx) return
    let wd: BuilderDocument
    try {
      wd = cmd.apply(structuredClone(doc))
    } catch {
      return
    }
    const b = wd.buildings.find((bb) => bb.floors.some((fl) => fl.id === floorId))
    const f = b?.floors.find((fl) => fl.id === floorId)
    const bRoot = b ? this.buildingRootById.get(b.id) : undefined
    if (!b || !f || !bRoot) return
    if (this.dragOverlay) {
      this.dragOverlay.fNode.dispose()
      this.dragOverlay.roof?.dispose()
    }
    const active = b.floors.find((fl) => fl.id === this.lastCtx?.activeLevelId)
    this.dragOverlay = this.buildFloorMeshes(wd, b, bRoot, f, this.lastCtx, active, { register: false })
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
        this.beginFloorDrag(meta.floorId)
        this.bundle.scene.activeCamera?.detachControl()
      } else if (meta?.kind === "opening" && meta.floorId && meta.entityId) {
        this.dragOpening = { floorId: meta.floorId, openingId: meta.entityId }
        this.beginFloorDrag(meta.floorId)
        this.bundle.scene.activeCamera?.detachControl()
      } else if (meta?.kind === "stair" && meta.floorId && meta.entityId) {
        this.dragStair = { floorId: meta.floorId, stairId: meta.entityId }
        this.beginFloorDrag(meta.floorId)
        this.bundle.scene.activeCamera?.detachControl()
      } else if (meta?.kind === "wall" && meta.floorId && meta.entityId) {
        const p = this.projectToPlane()
        if (p) {
          this.dragWall = { floorId: meta.floorId, edgeId: meta.entityId, startMm: { x: snapToGrid(p.x * 1000, 50), y: snapToGrid(p.z * 1000, 50) } }
          this.beginFloorDrag(meta.floorId)
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
        this.previewFloorDrag(this.dragWall.floorId, new MoveWallCommand(this.dragWall.floorId, this.dragWall.edgeId, dx, dy))
      }
      return
    }
    if (this.dragOpening) {
      const off = this.openingOffset(this.dragOpening.floorId, this.dragOpening.openingId)
      const now = performance.now()
      if (off != null && now - this.lastMoveAt > 33) {
        this.lastMoveAt = now
        this.previewFloorDrag(this.dragOpening.floorId, new MoveOpeningCommand(this.dragOpening.floorId, this.dragOpening.openingId, off))
      }
      return
    }
    if (this.dragStair) {
      const p = this.projectToPlane()
      if (!p) return
      const now = performance.now()
      if (now - this.lastMoveAt > 33) {
        this.lastMoveAt = now
        this.previewFloorDrag(this.dragStair.floorId, new MoveStairCommand(this.dragStair.floorId, this.dragStair.stairId, snapToGrid(p.x * 1000, 100), snapToGrid(p.z * 1000, 100)))
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
        this.previewFloorDrag(this.dragNode.floorId, new MoveNodeCommand(this.dragNode.floorId, this.dragNode.nodeId, { x: mmX, y: mmY }))
      }
      return
    }
    if (this.dragObject) {
      const p = this.projectToY(this.dragObject.planeY)
      if (!p) return
      const tk = "site" in this.dragObject.target ? "site" : this.dragObject.target.floorId
      const snap = this.snapObjectXZ(tk, snapToGrid(p.x * 1000, 50), snapToGrid(p.z * 1000, 50), this.dragObject.objectId)
      // Живое перемещение: двигаем корень объекта напрямую, команда — на отпускании.
      const root = this.objectRootById.get(this.dragObject.objectId)
      if (root) {
        const ay = root.getAbsolutePosition().y
        root.setAbsolutePosition(new Vector3(snap.x * S, ay, snap.z * S))
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
      // Перф: ховер-пикинг (полный raycast по сцене) троттлим — не на каждый mousemove.
      const now = performance.now()
      if (now - this.lastHoverAt < 50) return
      this.lastHoverAt = now
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
      this.endFloorDrag()
      if (p) {
        const dx = snapToGrid(p.x * 1000, 50) - this.dragWall.startMm.x
        const dy = snapToGrid(p.z * 1000, 50) - this.dragWall.startMm.y
        this.onCommand(new MoveWallCommand(this.dragWall.floorId, this.dragWall.edgeId, dx, dy))
      }
      this.dragWall = null
      if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
      return
    }
    if (this.dragOpening) {
      const off = this.openingOffset(this.dragOpening.floorId, this.dragOpening.openingId)
      this.endFloorDrag()
      if (off != null) this.onCommand(new MoveOpeningCommand(this.dragOpening.floorId, this.dragOpening.openingId, off))
      this.dragOpening = null
      if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
      return
    }
    if (this.dragStair) {
      const p = this.projectToPlane()
      this.endFloorDrag()
      if (p) this.onCommand(new MoveStairCommand(this.dragStair.floorId, this.dragStair.stairId, snapToGrid(p.x * 1000, 100), snapToGrid(p.z * 1000, 100)))
      this.dragStair = null
      if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
      return
    }
    if (this.dragNode) {
      const p = this.projectToPlane()
      this.endFloorDrag()
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
      const drag = this.dragObject
      const p = this.projectToY(drag.planeY)
      if (p) {
        const targetKey = "site" in drag.target ? "site" : drag.target.floorId
        const snapped = this.snapObjectXZ(targetKey, snapToGrid(p.x * 1000, 50), snapToGrid(p.z * 1000, 50), drag.objectId)
        const cx = snapped.x
        const cz = snapped.z
        const node = this.objectRootById.get(drag.objectId)
        const half = node ? this.nodeHalfExtents(node) : { hx: 300, hz: 300 }
        const box = { minX: cx - half.hx, maxX: cx + half.hx, minZ: cz - half.hz, maxZ: cz + half.hz }
        if (this.overlapsExisting(targetKey, box, drag.objectId)) {
          // Наложение — откатываем объект на исходную позицию (команду не шлём).
          const orig = this.findObjectPos(drag.target, drag.objectId)
          if (node && orig) node.setAbsolutePosition(new Vector3(orig.x * S, node.getAbsolutePosition().y, orig.z * S))
          this.onHud("Нельзя ставить объект на объект")
        } else {
          this.onCommand(new MoveObjectCommand(drag.target, drag.objectId, cx, cz))
        }
      }
      this.dragObject = null
      if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
    }
  }

  // Текущая позиция объекта (мм) из документа — для отката при наложении.
  private findObjectPos(target: { site: true } | { floorId: string }, id: string): { x: number; z: number } | null {
    const doc = this.getDoc()
    if (!doc) return null
    const o = "site" in target ? doc.site.objects.find((ob) => ob.id === id) : findFloor(doc, target.floorId)?.objects.find((ob) => ob.id === id)
    return o ? { x: o.position.x, z: o.position.z } : null
  }

  private handleWalkTap(): void {
    const { scene } = this.bundle
    const pick = scene.pick(scene.pointerX, scene.pointerY)
    const meta = (pick?.pickedMesh?.metadata ?? null) as MeshMeta | null
    if (!meta || meta.kind !== "opening" || !meta.floorId || !meta.entityId) return
    const doc = this.getDoc()
    const op = doc ? findFloor(doc, meta.floorId)?.openings.find((o) => o.id === meta.entityId) : undefined
    if (!op || op.type !== "door") return // окна не открываем
    const id = meta.entityId
    const meshes = this.meshById.get(id) ?? []
    if (this.openDoors.has(id)) {
      this.openDoors.delete(id)
      for (const m of meshes) m.visibility = 1
    } else {
      this.openDoors.add(id)
      for (const m of meshes) m.visibility = 0
    }
  }

  private handleTap(): void {
    if (this.dragNode || this.dragObject) return
    // Walk-режим: клик по двери открывает/закрывает её, без редактирования.
    if (this.walkCamera && this.bundle.scene.activeCamera === this.walkCamera) {
      this.handleWalkTap()
      return
    }
    if (this.tool === "object" && this.armedAsset) {
      this.handlePlaceObject()
      return
    }
    if (this.tool === "wall") {
      this.handleWallTap()
      return
    }
    if (this.tool === "water") {
      this.handleWaterTap()
      return
    }
    if (this.tool === "road" || this.tool === "fence") {
      this.handlePathTap()
      return
    }
    if (this.tool === "pave") {
      this.handlePaveTap()
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
    if (this.tool === "link") {
      if (meta?.kind === "room" && meta.floorId && meta.entityId) this.onLinkRoom(meta.floorId, meta.entityId)
      return
    }
    if (meta?.kind === "node") {
      this.onPick(null)
      return
    }
    // Shift+клик по объекту — добавить/убрать в мультивыбор.
    if (this.shiftDown && meta?.kind === "object" && meta.entityId) {
      this.onMultiToggle(meta.entityId)
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
    const spec = findPreset(this.openingType, this.openingVariant)
    const offset = Math.max(spec.width / 2 + 50, Math.min(len - spec.width / 2 - 50, c.t * len))
    if (len < spec.width + 200) return
    this.onCommand(
      new AddOpeningCommand(meta.floorId, {
        id: uid("op"),
        wallId: meta.entityId,
        type: this.openingType,
        variant: spec.variant,
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
    // Ближайший этаж ВЫШЕ по отметке (надёжнее, чем level+1) — лестница соединит их,
    // в его перекрытии появится вырез (floor-builder по toFloorId).
    const upper = building?.floors
      .filter((fl) => fl.elevation > f.elevation)
      .sort((x, y) => x.elevation - y.elevation)[0]
    if (!upper) {
      this.onHud("Нет этажа выше — добавьте этаж, чтобы лестница соединяла этажи")
    }
    const p = this.projectToPlane()
    if (!p) return
    const shape = this.stairShape as "straight" | "l" | "u" | "spiral"
    const toFloorId = upper?.id ?? f.id
    const width = 1100
    let pos: Vec2 = { x: snapToGrid(p.x * 1000, 100), y: snapToGrid(p.z * 1000, 100) }

    // Лестница не должна торчать сквозь стены: ставим ТОЛЬКО внутри помещения и
    // поджимаем к центру комнаты, пока её вырез-след целиком не окажется внутри контура.
    const candidate = (position: Vec2): Stair => ({ id: "candidate", shape, fromFloorId: f.id, toFloorId, position, rotationDeg: 0, width, railing: true })
    const rooms = detectRooms(f.wallGraph)
    if (rooms.length > 0) {
      const room = rooms.find((r) => pointInPolygon(pos, r.polygon))
      if (!room) {
        this.onHud("Лестницу нужно ставить внутри помещения, не на стену")
        return
      }
      const c = centroid(room.polygon)
      for (let k = 0; k < 30; k++) {
        const corners = stairHoleWorld(candidate(pos), f.height)
        if (corners.every((cc) => pointInPolygon(cc, room.polygon))) break
        pos = { x: Math.round(pos.x + (c.x - pos.x) * 0.1), y: Math.round(pos.y + (c.y - pos.y) * 0.1) }
      }
    }

    this.onCommand(
      new AddStairCommand(f.id, { id: uid("st"), shape, fromFloorId: f.id, toFloorId, position: pos, rotationDeg: 0, width, railing: true }),
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
    } else if (meta.kind === "water") this.onCommand(new DeleteWaterCommand(meta.entityId))
    else if (meta.kind === "path") this.onCommand(new DeletePathCommand(meta.entityId))
    else if (meta.kind === "pavement") this.onCommand(new DeletePavementCommand(meta.entityId))
  }

  // Смещение проёма вдоль его стены под текущим курсором (мм), с клампом по краям.
  private openingOffset(floorId: string, openingId: string): number | null {
    const doc = this.getDoc()
    const f = doc ? findFloor(doc, floorId) : undefined
    const o = f?.openings.find((op) => op.id === openingId)
    const e = o ? f?.wallGraph.edges[o.wallId] : undefined
    if (!f || !o || !e) return null
    const a = f.wallGraph.nodes[e.a]
    const b = f.wallGraph.nodes[e.b]
    const p = this.projectToPlane()
    if (!a || !b || !p) return null
    const c = closestOnSegment({ x: p.x * 1000, y: p.z * 1000 }, { x: a.x, y: a.y }, { x: b.x, y: b.y })
    const len = distance({ x: a.x, y: a.y }, { x: b.x, y: b.y })
    return Math.max(o.width / 2 + 50, Math.min(len - o.width / 2 - 50, c.t * len))
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

  // Котлован под цоколь/подвал: опускаем газон в пятне здания до отметки нижнего
  // подземного этажа + фундаментные стены по периметру (видно «вырытую яму»).
  private excavateBasements(doc: BuilderDocument): void {
    const ground = this.bundle.ground
    const positions = ground.getVerticesData(VertexBuffer.PositionKind)
    if (!positions || !this.docRoot) return
    let changed = false
    for (const b of doc.buildings) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, pitY = 0
      let hasBasement = false
      for (const f of b.floors) {
        if (f.elevation < 0) {
          hasBasement = true
          pitY = Math.min(pitY, f.elevation)
        }
        for (const id in f.wallGraph.nodes) {
          const n = f.wallGraph.nodes[id]
          if (n.x < minX) minX = n.x
          if (n.y < minY) minY = n.y
          if (n.x > maxX) maxX = n.x
          if (n.y > maxY) maxY = n.y
        }
      }
      if (!hasBasement || !isFinite(minX)) continue
      const m = 600
      const wx0 = (b.origin.x + minX - m) * S
      const wx1 = (b.origin.x + maxX + m) * S
      const wz0 = (b.origin.y + minY - m) * S
      const wz1 = (b.origin.y + maxY + m) * S
      const pitWorldY = pitY * S
      for (let i = 0; i < positions.length / 3; i++) {
        const x = positions[i * 3]
        const z = positions[i * 3 + 2]
        if (x >= wx0 && x <= wx1 && z >= wz0 && z <= wz1) {
          positions[i * 3 + 1] = pitWorldY
          changed = true
        }
      }
      // фундаментные стены по периметру котлована (от 0 до pitY)
      const mat = this.reg.get("concrete")
      const h = -pitWorldY
      const cy = pitWorldY / 2
      const t = 0.3
      const wall = (w: number, d: number, cx: number, cz: number) => {
        const box = MeshBuilder.CreateBox("pitwall", { width: w, height: h, depth: d }, this.bundle.scene)
        box.position.set(cx, cy, cz)
        box.material = mat
        box.receiveShadows = true
        box.parent = this.docRoot
      }
      wall(wx1 - wx0, t, (wx0 + wx1) / 2, wz0)
      wall(wx1 - wx0, t, (wx0 + wx1) / 2, wz1)
      wall(t, wz1 - wz0, wx0, (wz0 + wz1) / 2)
      wall(t, wz1 - wz0, wx1, (wz0 + wz1) / 2)
    }
    if (changed) {
      ground.updateVerticesData(VertexBuffer.PositionKind, positions)
      ground.refreshBoundingInfo()
    }
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
      else if (this.terrainMode === "terrace") {
        // Террасы: подтягиваем к ближайшей ступени 0.5 м (ступенчатый рельеф).
        const step = 0.5
        const target = Math.round((h + strength * fall * 0.5) / step) * step
        h += (target - h) * fall * 0.6
      } else h += (hit.y - h) * fall * 0.25
      this.terrainHeights[i] = h
      positions[i * 3 + 1] = h
    }
    this.bundle.ground.updateVerticesData(VertexBuffer.PositionKind, positions)
    this.bundle.ground.refreshBoundingInfo()
    this.updateGroundSplat()
  }

  // Раскраска газона по высоте (splat без шейдера): подводный песок / трава / скала.
  // Цвета пишем в Color VertexBuffer земли; базовый цвет материала = белый множитель.
  private updateGroundSplat(): void {
    const ground = this.bundle.ground
    const positions = ground.getVerticesData(VertexBuffer.PositionKind)
    if (!positions) return
    const vCount = positions.length / 3
    const colors = new Array<number>(vCount * 4)
    const SAND: [number, number, number] = [0.76, 0.7, 0.5]
    const GRASS: [number, number, number] = [0.36, 0.55, 0.27]
    const DRY: [number, number, number] = [0.55, 0.56, 0.36]
    const ROCK: [number, number, number] = [0.5, 0.5, 0.52]
    for (let i = 0; i < vCount; i++) {
      const y = positions[i * 3 + 1]
      let c = GRASS
      if (y < -0.1) c = SAND
      else if (y > 4) c = ROCK
      else if (y > 1.6) c = DRY
      colors[i * 4] = c[0]
      colors[i * 4 + 1] = c[1]
      colors[i * 4 + 2] = c[2]
      colors[i * 4 + 3] = 1
    }
    ground.setVerticesData(VertexBuffer.ColorKind, colors)
    const mat = ground.material
    if (mat instanceof StandardMaterial) mat.diffuseColor = new Color3(1, 1, 1)
  }

  // ── Вода по контуру (сплайн) ─────────────────────────────────────────────────
  // Клик добавляет точку контура; клик у первой точки (≥3) замыкает и заливает воду
  // с прокопом русла. Enter — замкнуть из любого места, Esc — отмена (см. BuilderApp).
  private handleWaterTap(): void {
    const p = this.projectToY(0)
    if (!p) return
    const mm: Vec2 = { x: snapToGrid(p.x * 1000, 100), y: snapToGrid(p.z * 1000, 100) }
    if (this.waterPoints.length >= 3) {
      const first = this.waterPoints[0]
      if (Math.hypot(mm.x - first.x, mm.y - first.y) < 900) {
        this.finalizeWater()
        return
      }
    }
    this.waterPoints.push(mm)
    this.updateWaterPreview()
    this.onHud(`Водоём: точек ${this.waterPoints.length} · клик у старта или Enter — залить, Esc — отмена`)
  }

  isDrawingWater(): boolean {
    return this.tool === "water" && this.waterPoints.length > 0
  }

  finalizeWater(): void {
    if (this.waterPoints.length < 3) {
      this.cancelWater()
      return
    }
    const points = this.waterPoints.map((p) => ({ ...p }))
    const depth = Math.max(100, this.waterDepth)
    this.onCommand(new AddWaterCommand({ id: uid("w"), points, depth, kind: "pond" }))
    this.carveWaterbed(points, depth)
    this.cancelWater()
    this.onHud(null)
  }

  cancelWater(): void {
    this.waterPoints = []
    this.waterPreview?.dispose()
    this.waterPreview = null
  }

  // Прокоп русла: опускаем вершины газона внутри контура до отметки −depth (с мягким краем).
  private carveWaterbed(points: Vec2[], depthMm: number): void {
    this.ensureTerrainHeights()
    if (!this.terrainHeights) return
    const positions = this.bundle.ground.getVerticesData(VertexBuffer.PositionKind)
    if (!positions) return
    const bedY = -depthMm / 1000
    let changed = false
    for (let i = 0; i < this.terrainHeights.length; i++) {
      const mmX = positions[i * 3] / S
      const mmZ = positions[i * 3 + 2] / S
      if (pointInPolygon({ x: mmX, y: mmZ }, points)) {
        if (this.terrainHeights[i] > bedY) {
          this.terrainHeights[i] = bedY
          positions[i * 3 + 1] = bedY
          changed = true
        }
      }
    }
    if (changed) {
      this.bundle.ground.updateVerticesData(VertexBuffer.PositionKind, positions)
      this.bundle.ground.refreshBoundingInfo()
      this.updateGroundSplat()
      this.onCommand(new SetTerrainCommand(this.terrainHeights))
    }
  }

  private updateWaterPreview(): void {
    this.waterPreview?.dispose()
    if (this.waterPoints.length === 0) {
      this.waterPreview = null
      return
    }
    const root = new TransformNode("waterPreview", this.bundle.scene)
    const mat = this.reg.water()
    for (const pt of this.waterPoints) {
      const dot = MeshBuilder.CreateDisc("wpt", { radius: 0.35, tessellation: 16 }, this.bundle.scene)
      dot.rotation.x = Math.PI / 2
      dot.position.set(pt.x * S, 0.05, pt.y * S)
      dot.material = mat
      dot.isPickable = false
      dot.parent = root
    }
    if (this.waterPoints.length >= 2) {
      const line = this.waterPoints.map((p) => new Vector3(p.x * S, 0.06, p.y * S))
      if (this.waterPoints.length >= 3) line.push(line[0].clone())
      const poly = MeshBuilder.CreateLines("wline", { points: line }, this.bundle.scene)
      poly.color = Color3.FromHexString("#38BDF8")
      poly.isPickable = false
      poly.parent = root
    }
    this.waterPreview = root
  }

  // ── Линии по сплайну (дорога/дорожка/забор) ──────────────────────────────────
  // Клик ставит точки; клик у последней точки (≥2) или Enter — завершить, Esc — отмена.
  private handleWaterOrPathLabel(): string {
    return this.pathKind === "fence" ? "Забор" : this.pathKind === "path" ? "Дорожка" : "Дорога"
  }

  private handlePathTap(): void {
    const p = this.projectToY(0)
    if (!p) return
    const mm: Vec2 = { x: snapToGrid(p.x * 1000, 100), y: snapToGrid(p.z * 1000, 100) }
    if (this.pathPoints.length >= 2) {
      const last = this.pathPoints[this.pathPoints.length - 1]
      if (Math.hypot(mm.x - last.x, mm.y - last.y) < 600) {
        this.finalizePath()
        return
      }
    }
    this.pathPoints.push(mm)
    this.updatePathPreview()
    this.onHud(`${this.handleWaterOrPathLabel()}: точек ${this.pathPoints.length} · повторный клик в конце или Enter — готово, Esc — отмена`)
  }

  isDrawingPath(): boolean {
    return (this.tool === "road" || this.tool === "fence") && this.pathPoints.length > 0
  }

  finalizePath(): void {
    if (this.pathPoints.length < 2) {
      this.cancelPath()
      return
    }
    const points = this.pathPoints.map((p) => ({ ...p }))
    const kind = this.tool === "fence" ? "fence" : this.pathKind === "path" ? "path" : "road"
    const style = kind === "fence" ? this.fenceStyle : "wood"
    this.onCommand(new AddPathCommand({ id: uid("p"), points, width: Math.max(300, this.pathWidth), kind, style }))
    this.cancelPath()
    this.onHud(null)
  }

  cancelPath(): void {
    this.pathPoints = []
    this.pathPreview?.dispose()
    this.pathPreview = null
  }

  private updatePathPreview(): void {
    this.pathPreview?.dispose()
    if (this.pathPoints.length === 0) {
      this.pathPreview = null
      return
    }
    const root = new TransformNode("pathPreview", this.bundle.scene)
    const mat = this.reg.status("#A78BFA")
    for (const pt of this.pathPoints) {
      const dot = MeshBuilder.CreateDisc("ppt", { radius: 0.35, tessellation: 16 }, this.bundle.scene)
      dot.rotation.x = Math.PI / 2
      dot.position.set(pt.x * S, 0.07, pt.y * S)
      dot.material = mat
      dot.isPickable = false
      dot.parent = root
    }
    if (this.pathPoints.length >= 2) {
      const line = this.pathPoints.map((p) => new Vector3(p.x * S, 0.08, p.y * S))
      const poly = MeshBuilder.CreateLines("pline", { points: line }, this.bundle.scene)
      poly.color = Color3.FromHexString("#A78BFA")
      poly.isPickable = false
      poly.parent = root
    }
    this.pathPreview = root
  }

  // ── Площадка-покрытие по контуру ──────────────────────────────────────────────
  // Клик ставит точки; клик у первой точки (≥3) или Enter — залить, Esc — отмена.
  private handlePaveTap(): void {
    const p = this.projectToY(0)
    if (!p) return
    const mm: Vec2 = { x: snapToGrid(p.x * 1000, 100), y: snapToGrid(p.z * 1000, 100) }
    if (this.pavePoints.length >= 3) {
      const first = this.pavePoints[0]
      if (Math.hypot(mm.x - first.x, mm.y - first.y) < 900) {
        this.finalizePave()
        return
      }
    }
    this.pavePoints.push(mm)
    this.updatePavePreview()
    this.onHud(`Площадка: точек ${this.pavePoints.length} · клик у старта или Enter — залить, Esc — отмена`)
  }

  isDrawingPave(): boolean {
    return this.tool === "pave" && this.pavePoints.length > 0
  }

  finalizePave(): void {
    if (this.pavePoints.length < 3) {
      this.cancelPave()
      return
    }
    const points = this.pavePoints.map((p) => ({ ...p }))
    this.onCommand(new AddPavementCommand({ id: uid("pv"), points, materialId: this.paveMaterial }))
    this.cancelPave()
    this.onHud(null)
  }

  cancelPave(): void {
    this.pavePoints = []
    this.pavePreview?.dispose()
    this.pavePreview = null
  }

  private updatePavePreview(): void {
    this.pavePreview?.dispose()
    if (this.pavePoints.length === 0) {
      this.pavePreview = null
      return
    }
    const root = new TransformNode("pavePreview", this.bundle.scene)
    const mat = this.reg.status("#38BDF8")
    for (const pt of this.pavePoints) {
      const dot = MeshBuilder.CreateDisc("pvpt", { radius: 0.35, tessellation: 16 }, this.bundle.scene)
      dot.rotation.x = Math.PI / 2
      dot.position.set(pt.x * S, 0.1, pt.y * S)
      dot.material = mat
      dot.isPickable = false
      dot.parent = root
    }
    if (this.pavePoints.length >= 2) {
      const line = this.pavePoints.map((p) => new Vector3(p.x * S, 0.11, p.y * S))
      if (this.pavePoints.length >= 3) line.push(line[0].clone())
      const poly = MeshBuilder.CreateLines("pvline", { points: line }, this.bundle.scene)
      poly.color = Color3.FromHexString("#38BDF8")
      poly.isPickable = false
      poly.parent = root
    }
    this.pavePreview = root
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

  // ── Запрет наложения объектов ────────────────────────────────────────────────
  // Базовый габарит ассета (ширина X / глубина Z, мм) при scale=1, rotation=0.
  // Измеряется временным мешем один раз, кэшируется по assetId.
  private baseSize(assetId: string): { w: number; d: number; h: number } {
    const cached = this.assetBaseSize.get(assetId)
    if (cached) return cached
    const probe = new TransformNode("probe", this.bundle.scene)
    buildObject({ id: "probe", assetId, position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1, attachTo: "floor", locked: false }, probe, this.bundle.scene, "probe")
    probe.computeWorldMatrix(true)
    const { min, max } = probe.getHierarchyBoundingVectors(true)
    const size = isFinite(min.x) && isFinite(max.x)
      ? { w: (max.x - min.x) / S, d: (max.z - min.z) / S, h: (max.y - min.y) / S }
      : { w: 1000, d: 1000, h: 1000 }
    probe.dispose()
    this.assetBaseSize.set(assetId, size)
    return size
  }

  // Собирает базовые габариты используемых ассетов и отдаёт в UI (ввод размеров в метрах).
  private emitBaseSizes(doc: BuilderDocument): void {
    const ids = new Set<string>()
    for (const o of doc.site.objects) ids.add(o.assetId)
    for (const b of doc.buildings) for (const f of b.floors) for (const o of f.objects) ids.add(o.assetId)
    const rec: Record<string, { w: number; d: number; h: number }> = {}
    for (const id of ids) rec[id] = this.baseSize(id)
    this.onObjectBaseSizes(rec)
  }

  // Записываем габариты объекта в плане (мировой AABB, мм) после сборки.
  private recordFootprint(id: string, target: string, node: TransformNode): void {
    node.computeWorldMatrix(true)
    const { min, max } = node.getHierarchyBoundingVectors(true)
    if (!isFinite(min.x) || !isFinite(max.x)) return
    this.objectFootprints.set(id, { target, minX: min.x / S, maxX: max.x / S, minZ: min.z / S, maxZ: max.z / S })
  }

  // Пересекается ли прямоугольник с уже стоящим объектом на том же уровне (с допуском
  // на касание). excludeId — игнорировать сам перемещаемый объект.
  private overlapsExisting(target: string, box: { minX: number; maxX: number; minZ: number; maxZ: number }, excludeId?: string): boolean {
    const TOL = 60 // мм — допускаем плотное прилегание, блокируем реальное наложение
    for (const [id, fp] of this.objectFootprints) {
      if (id === excludeId || fp.target !== target) continue
      if (box.minX < fp.maxX - TOL && box.maxX > fp.minX + TOL && box.minZ < fp.maxZ - TOL && box.maxZ > fp.minZ + TOL) return true
    }
    return false
  }

  // Магнит-выравнивание: подтягивает центр X/Z к центрам соседних объектов на том же
  // уровне (в пределах допуска), чтобы мебель вставала в линию/столбец. Не двигает к самому себе.
  private snapObjectXZ(targetKey: string, x: number, z: number, excludeId?: string): { x: number; z: number } {
    const TH = 200 // мм
    let sx = x, sz = z, bx = TH, bz = TH
    for (const [id, fp] of this.objectFootprints) {
      if (id === excludeId || fp.target !== targetKey) continue
      const cx = (fp.minX + fp.maxX) / 2
      const cz = (fp.minZ + fp.maxZ) / 2
      const dx = Math.abs(x - cx), dz = Math.abs(z - cz)
      if (dx < bx) { bx = dx; sx = cx }
      if (dz < bz) { bz = dz; sz = cz }
    }
    return { x: sx, z: sz }
  }

  // Габариты узла в плане (полу-ширина/полу-глубина, мм) для проверки в новой точке.
  private nodeHalfExtents(node: TransformNode): { hx: number; hz: number } {
    node.computeWorldMatrix(true)
    const { min, max } = node.getHierarchyBoundingVectors(true)
    if (!isFinite(min.x) || !isFinite(max.x)) return { hx: 300, hz: 300 }
    return { hx: (max.x - min.x) / 2 / S, hz: (max.z - min.z) / 2 / S }
  }

  private handlePlaceObject(): void {
    if (!this.armedAsset) return
    const p = this.projectToPlane()
    if (!p) return
    const doc = this.getDoc()
    const onFloor = doc ? findFloor(doc, this.activeFloorId) : undefined
    const target = onFloor ? ({ floorId: this.activeFloorId } as const) : ({ site: true } as const)
    const targetKey = onFloor ? this.activeFloorId : "site"
    const aligned = this.snapObjectXZ(targetKey, snapToGrid(p.x * 1000, 50), snapToGrid(p.z * 1000, 50))
    const cx = aligned.x
    const cz = aligned.z
    // Проверка наложения по габаритам призрака.
    const half = this.placerGhost ? this.nodeHalfExtents(this.placerGhost) : { hx: 300, hz: 300 }
    const box = { minX: cx - half.hx, maxX: cx + half.hx, minZ: cz - half.hz, maxZ: cz + half.hz }
    if (this.overlapsExisting(targetKey, box)) {
      this.onHud("Здесь уже есть объект — выберите свободное место")
      return
    }
    this.onCommand(
      new AddObjectCommand(target, {
        id: uid("o"),
        assetId: this.armedAsset,
        position: { x: cx, y: 0, z: cz },
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

  // Вписать всю сцену в кадр (клавиша F): центрируем орбитальную камеру на габаритах.
  frameAll(): void {
    if (!this.docRoot) return
    const { min, max } = this.docRoot.getHierarchyBoundingVectors(true)
    if (!isFinite(min.x) || !isFinite(max.x)) return
    const cam = this.bundle.camera
    const cx = (min.x + max.x) / 2, cy = (min.y + max.y) / 2, cz = (min.z + max.z) / 2
    const span = Math.max(max.x - min.x, max.y - min.y, max.z - min.z)
    cam.setTarget(new Vector3(cx, cy, cz))
    cam.radius = Math.max(8, Math.min(cam.upperRadiusLimit ?? 500, span * 1.4 + 6))
  }

  // Снимок сцены (PNG data-URL). preserveDrawingBuffer включён в createScene.
  captureDataUrl(): string | null {
    const canvas = this.bundle.engine.getRenderingCanvas()
    if (!canvas) return null
    this.bundle.scene.render()
    return canvas.toDataURL("image/png")
  }

  dispose(): void {
    this.cancelWallTool()
    this.cancelPlacer()
    this.cancelWater()
    this.cancelPath()
    this.cancelPave()
    this.roomPreview?.dispose()
    for (const l of this.lights) l.dispose()
    this.lights = []
    this.gizmo.dispose()
    this.bundle.engine.stopRenderLoop()
    this.reg.dispose()
    this.bundle.scene.dispose()
    this.bundle.engine.dispose()
  }
}
