// ADR: Жизненный цикл движка и пересборка сцены из документа (§4.1, §6.3). Фаза 1:
// полная пересборка doc-мешей на rev (инкрементальный dirty-flag — Фаза 2). Picking,
// выделение (HighlightLayer), режимы камеры, базовый инструмент стены (2 клика). Один
// Engine на canvas, корректный dispose, защита от повторной инициализации (StrictMode).

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
} from "@babylonjs/core"
import type { BuilderDocument, Floor } from "@/types/builder"
import { findFloor, type Command, InsertWallCommand, DeleteWallCommand, DeleteObjectCommand } from "@/core/document/commands"
import { DEFAULT_WALL } from "@/core/geometry/wall-graph"
import { snapToGrid } from "@/core/geometry/math"
import { createScene, type SceneBundle } from "./create-scene"
import { MaterialRegistry } from "./material-registry"
import { buildWalls } from "./builders/wall-builder"
import { buildFloors, type StatusResolver } from "./builders/floor-builder"
import { buildRoof } from "./builders/roof-builder"
import { buildObject } from "./builders/object-builder"
import type { CameraMode, DisplayMode, Selection, Tool } from "@/store/builder-store"

const S = 0.001
const ACCENT = Color3.FromHexString("#38BDF8")

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
  private wallStart: Vector3 | null = null
  private preview: Mesh | null = null
  private startMarker: Mesh | null = null

  // контекст из стора (обновляется приложением)
  tool: Tool = "select"
  activeFloorId = ""
  onPick: (meta: MeshMeta | null) => void = () => {}
  onCommand: (cmd: Command) => void = () => {}
  getDoc: () => BuilderDocument | null = () => null
  statusResolver: StatusResolver = () => undefined

  constructor(canvas: HTMLCanvasElement) {
    this.bundle = createScene(canvas)
    this.reg = new MaterialRegistry(this.bundle.scene)
    this.setupPointer()
    this.bundle.engine.runRenderLoop(() => this.bundle.scene.render())
  }

  // ── Пересборка сцены из документа ──────────────────────────────────────────
  rebuild(doc: BuilderDocument, ctx: RebuildContext): void {
    const scene = this.bundle.scene
    if (this.docRoot) this.docRoot.dispose()
    this.meshById.clear()
    this.docRoot = new TransformNode("docRoot", scene)

    const register = (id: string | undefined, mesh: Mesh) => {
      if (!id) return
      const arr = this.meshById.get(id) ?? []
      arr.push(mesh)
      this.meshById.set(id, arr)
    }

    // Участок: объекты
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

    // Здания
    for (const b of doc.buildings) {
      const bRoot = new TransformNode(`b_${b.id}`, scene)
      bRoot.parent = this.docRoot
      bRoot.position.set(b.origin.x * S, 0, b.origin.y * S)
      const active = b.floors.find((f) => f.id === ctx.activeLevelId)

      for (const f of b.floors) {
        const fNode = new TransformNode(`f_${f.id}`, scene)
        fNode.parent = bRoot
        fNode.position.y = f.elevation * S
        const walls = buildWalls(f, fNode, scene, this.reg)
        const floorMeshes = buildFloors(f, fNode, scene, this.reg, this.statusResolver)
        for (const m of walls) {
          register(m.metadata?.entityId, m)
          this.bundle.shadow.addShadowCaster(m)
        }
        for (const m of floorMeshes) register(m.metadata?.entityId, m)

        const roof = buildRoof(f, bRoot, scene, this.reg)
        if (roof) {
          register(roof.metadata?.entityId, roof)
          this.bundle.shadow.addShadowCaster(roof)
        }

        this.applyFloorVisibility(f, fNode, roof, ctx, active)
      }
    }
  }

  private applyFloorVisibility(
    f: Floor,
    fNode: TransformNode,
    roof: Mesh | null,
    ctx: RebuildContext,
    active: Floor | undefined,
  ): void {
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
    // ghost: выше активного — полупрозрачные
    if (f.level <= active.level) setVis(1, true)
    else setVis(0.18, true)
  }

  // ── Выделение ───────────────────────────────────────────────────────────────
  setSelection(sel: Selection): void {
    this.bundle.highlight.removeAllMeshes()
    if (sel.type !== "none" && sel.id) {
      for (const m of this.meshById.get(sel.id) ?? []) this.bundle.highlight.addMesh(m, ACCENT)
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
        this.walkCamera = wc
      }
      camera.detachControl()
      scene.activeCamera = this.walkCamera
      if (canvas) this.walkCamera.attachControl(canvas, true)
      this.walkCamera.setTarget(new Vector3(0, 1.7, 0))
      return
    }
    if (this.walkCamera) this.walkCamera.detachControl()
    scene.activeCamera = camera
    if (canvas) camera.attachControl(canvas, true)
    camera.mode = mode === "plan" ? Camera.ORTHOGRAPHIC_CAMERA : Camera.PERSPECTIVE_CAMERA
    if (mode === "top" || mode === "plan") {
      camera.alpha = -Math.PI / 2
      camera.beta = 0.02
    } else {
      camera.alpha = -Math.PI / 4
      camera.beta = Math.PI / 3.2
    }
    if (mode === "plan") {
      const r = camera.radius
      const aspect = this.bundle.engine.getAspectRatio(camera)
      camera.orthoTop = r * 0.5
      camera.orthoBottom = -r * 0.5
      camera.orthoLeft = -r * 0.5 * aspect
      camera.orthoRight = r * 0.5 * aspect
    }
  }

  // ── Указатель/инструменты ────────────────────────────────────────────────────
  private setupPointer(): void {
    const scene = this.bundle.scene
    scene.onPointerObservable.add((pi) => {
      if (pi.type === PointerEventTypes.POINTERTAP) this.handleTap()
      else if (pi.type === PointerEventTypes.POINTERMOVE && this.tool === "wall" && this.wallStart) this.updatePreview()
    })
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

  private snapPoint(p: Vector3): { mmX: number; mmY: number; world: Vector3 } {
    const mmX = snapToGrid(p.x * 1000, 100)
    const mmY = snapToGrid(p.z * 1000, 100)
    return { mmX, mmY, world: new Vector3(mmX * S, this.activeFloorPlaneY() + 0.02, mmY * S) }
  }

  private handleTap(): void {
    const { scene } = this.bundle
    if (this.tool === "wall") {
      this.handleWallTap()
      return
    }
    const pick = scene.pick(scene.pointerX, scene.pointerY)
    const meta = (pick?.pickedMesh?.metadata ?? null) as MeshMeta | null
    if (this.tool === "delete") {
      this.handleDelete(meta)
      return
    }
    this.onPick(meta && meta.entityId ? meta : null)
  }

  private handleWallTap(): void {
    if (!this.activeFloorId) return
    const p = this.projectToPlane()
    if (!p) return
    const snapped = this.snapPoint(p)
    if (!this.wallStart) {
      this.wallStart = snapped.world
      this.showStartMarker(snapped.world)
      return
    }
    const fromX = snapToGrid(this.wallStart.x * 1000, 100)
    const fromY = snapToGrid(this.wallStart.z * 1000, 100)
    if (Math.hypot(snapped.mmX - fromX, snapped.mmY - fromY) >= 100) {
      this.onCommand(
        new InsertWallCommand(this.activeFloorId, { x: fromX, y: fromY }, { x: snapped.mmX, y: snapped.mmY }, DEFAULT_WALL),
      )
    }
    this.clearWallTool()
  }

  private handleDelete(meta: MeshMeta | null): void {
    if (!meta || !meta.entityId) return
    if (meta.kind === "wall" && meta.floorId) this.onCommand(new DeleteWallCommand(meta.floorId, meta.entityId))
    else if (meta.kind === "object") {
      const target = meta.target === "site" ? ({ site: true } as const) : ({ floorId: meta.target ?? "" } as const)
      this.onCommand(new DeleteObjectCommand(target, meta.entityId))
    }
  }

  private showStartMarker(world: Vector3): void {
    this.startMarker?.dispose()
    const m = MeshBuilder.CreateSphere("wallStart", { diameter: 0.35 }, this.bundle.scene)
    m.position.copyFrom(world)
    m.isPickable = false
    const mat = this.reg.status("#38BDF8")
    m.material = mat
    this.startMarker = m
  }

  private updatePreview(): void {
    if (!this.wallStart) return
    const p = this.projectToPlane()
    if (!p) return
    const snapped = this.snapPoint(p)
    this.preview?.dispose()
    const a = this.wallStart
    const b = snapped.world
    const len = Vector3.Distance(a, b)
    if (len < 0.05) return
    const box = MeshBuilder.CreateBox("wallPreview", { width: len, depth: 0.2, height: 3 }, this.bundle.scene)
    box.position.set((a.x + b.x) / 2, this.activeFloorPlaneY() + 1.5, (a.z + b.z) / 2)
    box.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x)
    box.isPickable = false
    box.visibility = 0.4
    box.material = this.reg.status("#38BDF8")
    this.preview = box
  }

  cancelWallTool(): void {
    this.clearWallTool()
  }

  private clearWallTool(): void {
    this.wallStart = null
    this.preview?.dispose()
    this.preview = null
    this.startMarker?.dispose()
    this.startMarker = null
  }

  focusOrbit(): void {
    this.setCameraMode("orbit")
  }

  resize(): void {
    this.bundle.engine.resize()
  }

  dispose(): void {
    this.clearWallTool()
    this.bundle.engine.stopRenderLoop()
    this.reg.dispose()
    this.bundle.scene.dispose()
    this.bundle.engine.dispose()
  }
}
