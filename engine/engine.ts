// ADR: Жизненный цикл движка и пересборка сцены из документа (§4.1, §6.3). Фаза 2/3:
// рисование стен цепочкой со snap (узлы/сетка/угол 15°) и вводом длины с клавиатуры;
// перетаскивание узла (стены следуют); инструменты проёмов (реальные вырезы), лестниц
// (вырез в перекрытии), ведра материалов; ховер-outline. Один Engine, корректный dispose.

import { floorRooms } from "@/lib/builder/rooms"
import { arcSegmentIds } from "@/lib/builder/arc"
import {
  Camera,
  Color3,
  Color4,
  Matrix,
  Mesh,
  MeshBuilder,
  PointLight,
  PointerEventTypes,
  Ray,
  StandardMaterial,
  Texture,
  TransformNode,
  UniversalCamera,
  Vector3,
  VertexBuffer,
} from "@babylonjs/core"
import { uid } from "@/core/id"
import type { BuilderDocument, Floor, Building, Stair, MepSystem } from "@/types/builder"
import { MEP_SYSTEMS } from "@/types/builder"
import { MEP_DEVICE_BY_KIND, MEP_SYSTEM_INFO, deviceHeight, polylineLengthMm } from "@/lib/builder/mep/catalog"
import { snapMepPoint, wallMount } from "@/lib/builder/mep/snap"
import { buildMep } from "./builders/mep-builder"
import { dimGeometry, signedOffset } from "@/lib/builder/annotations"
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
  CompositeCommand,
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
  AddMepRunCommand,
  AddMepDeviceCommand,
  DeleteMepRunCommand,
  DeleteMepDeviceCommand,
  AddSectionCommand,
  DeleteSectionCommand,
  replanDeleteWall,
  replanDeleteOpening,
  AddAnnotationCommand,
  DeleteAnnotationCommand,
  nextSectionName,
} from "@/core/document/commands"
import { DEFAULT_WALL } from "@/core/geometry/wall-graph"
import { centroid, closestOnSegment, distance, pointInPolygon, snapToGrid, type Vec2 } from "@/core/geometry/math"
import { detectRooms } from "@/core/geometry/room-detection"
import { curtainSize, findPreset, isCurtain, sameWallOnFloor } from "@/lib/builder/openings"
import { nodeDragTarget, passedDragThreshold, wallPushDelta } from "@/lib/builder/drag-math"
import { arcPoints } from "@/lib/builder/arc"
import { worldUVFor } from "./world-uv"
import { labelPoint } from "@/lib/builder/drawing/floor-drawing"
import earcut from "earcut"
import { buildingOutline } from "@/lib/builder/drawing/indicators"
import { objectCorners } from "@/lib/builder/plan-editor-math"
import { insideBuilding, snapColumn } from "@/lib/builder/plan-editor-math"
import { createScene, paintSky, type SceneBundle } from "./create-scene"
import { MaterialRegistry } from "./material-registry"
import { buildWalls } from "./builders/wall-builder"
import { buildFloors, type StatusResolver } from "./builders/floor-builder"
import { buildRoof } from "./builders/roof-builder"
import { buildObject } from "./builders/object-builder"
import { buildFurnish } from "./builders/furnish-builder"
import { clampHour, daylight } from "@/lib/builder/daylight"
import { buildStair, stairHoleWorld } from "./builders/stair-builder"
import { buildWater } from "./builders/water-builder"
import { buildPath } from "./builders/path-builder"
import { buildPavement } from "./builders/pavement-builder"
import { LIGHT_ASSETS } from "./builders/object-builder"
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline"
import { GizmoController, type GizmoMode } from "./gizmo"
import type { CameraMode, DisplayMode, Selection, Tool } from "@/store/builder-store"
import type { ScreenLabel } from "@/store/label-store"

const S = 0.001
/** Рост человека в обходе (метры от пола до глаз). */
const EYE = 1.7
// Итоговая скорость ≈ speed·3,16/(1−inertia): при speed 0,22 и inertia 0,5 это
// ~1,4 м/с — спокойный шаг, с Shift ~3 м/с — бег. От частоты кадров не зависит.
const WALK_SPEED = 0.22
const RUN_FACTOR = 2.2
/** Во что упирается человек в обходе. Ставится при сборке — иначе после любой
 *  перестройки сцены столкновения терялись и он проходил сквозь стены. */
const SOLID_KINDS = new Set(["wall", "room", "stair", "roof", "object", "opening"])
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
  /** видимые системы сетей; по умолчанию — все */
  mepLayers?: MepSystem[]
  /** режим «Сети»: архитектура активного этажа полупрозрачная */
  mepFocus?: boolean
  /** лёгкий режим: декор (отделка, плинтусы, откосы, отмостка) не строится */
  lite?: boolean
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
  /** режим дуги: конец дуги уже задан, ждём точку на дуге */
  wallArc = false
  private arcEnd: Vec2 | null = null
  private arcPreview: Mesh | null = null
  private lastDir: Vec2 = { x: 1, y: 0 }
  private lengthInput = ""
  private preview: Mesh | null = null
  private startMarker: Mesh | null = null

  // перетаскивание узла / объекта
  // moved — узел реально потянули (> 4 px). Клик по узлу без движения не
  // должен ни двигать его на сетку, ни класть запись в историю.
  private dragNode: { floorId: string; nodeId: string; sx: number; sy: number; moved: boolean; orig: Vec2; startMm: Vec2; neighbors: Vec2[] } | null = null
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
  // Рисование протягиванием (drag): дорога/забор — прямой отрезок, площадка —
  // прямоугольник. Старт фиксируется на pointer-down, превью следует за курсором,
  // на pointer-up строится объект. Клик без протягивания — прежний мультиточечный ввод.
  private pathDragStart: Vec2 | null = null
  private dragPreview: TransformNode | null = null
  private suppressTap = false

  // площадка-покрытие по контуру
  private pavePoints: Vec2[] = [] // мм
  private pavePreview: TransformNode | null = null

  // комната-прямоугольник / перемещение стены / орто-лок
  private roomStart: Vector3 | null = null
  private roomPreview: Mesh | null = null
  // Перетаскивания. sx/sy — экранная точка нажатия, moved — порог пройден.
  // Пока порог не пройден, это клик: геометрия не двигается, история не пишется.
  private dragWall: { floorId: string; edgeId: string; startMm: Vec2; a: Vec2; b: Vec2; sx: number; sy: number; moved: boolean } | null = null
  private dragOpening: { floorId: string; openingId: string; sx: number; sy: number; moved: boolean } | null = null
  private dragStair: { floorId: string; stairId: string; sx: number; sy: number; moved: boolean } | null = null
  private shiftDown = false
  // нажатие левой кнопкой — для распознавания клика
  private press: { x: number; y: number } | null = null
  // рамка выделения в плане (экранные пиксели движка)
  private box: { sx: number; sy: number; moved: boolean; additive: boolean } | null = null
  // ручки-узлы: только у выделенной стены (как grips в AutoCAD)
  private grips: Mesh[] = []
  // конец перетаскивания — чтобы следом пришедший tap не сменил выделение
  private lastDragEndAt = 0

  private renderUntil = 0
  private paused = false
  private lastView: number[] | null = null
  private detachKeys: (() => void) | null = null
  private fpsLowSince = 0
  private fpsWarned = false
  /** движок сам заметил, что кадров мало, — BuilderApp включает лёгкий режим */
  onLowFps: () => void = () => {}

  /** Нарисовать ближайшие ms миллисекунд (что-то изменилось). */
  invalidate(ms = 500): void {
    this.renderUntil = Math.max(this.renderUntil, performance.now() + ms)
  }

  /** Подсветка помещений по статусу аренды: выключается кнопкой «Арендаторы». */
  setShowTenants(on: boolean): void {
    this.showTenants = on
    if (!this.docRoot) return
    for (const m of this.docRoot.getChildMeshes()) {
      if ((m.metadata as MeshMeta | null)?.kind === "status") m.setEnabled(on)
    }
    this.invalidate(600)
  }
  private showTenants = true

  /**
   * Автомебель: столы, диваны и светильники по назначению помещений. Только вид —
   * в документ ничего не пишется, на планах и в БТИ этой мебели нет.
   */
  setShowFurniture(on: boolean): void {
    if (on === this.showFurniture) return
    this.showFurniture = on
    if (this.lastDoc && this.lastCtx) this.rebuild(this.lastDoc, this.lastCtx)
  }

  private showFurniture = true

  /** час суток для солнца, 5–21 */
  private hourOfDay = 13

  /**
   * Время суток: солнце, цвет света, небо и дымка. По направлению теней видно,
   * как объект стоит по сторонам света — какие окна утром на солнце.
   */
  setTimeOfDay(hour: number): void {
    const h = clampHour(hour)
    if (Math.abs(h - this.hourOfDay) < 0.01) return
    this.hourOfDay = h
    this.applyDaylight()
  }

  getTimeOfDay(): number {
    return this.hourOfDay
  }

  private applyDaylight(): void {
    const d = daylight(this.hourOfDay)
    const { sun, fill, hemi, scene, shadow, sky } = this.bundle
    sun.direction = new Vector3(d.dir.x, d.dir.y, d.dir.z)
    sun.position = new Vector3(-d.dir.x * 80, Math.max(12, -d.dir.y * 90), -d.dir.z * 80)
    sun.intensity = d.sun
    sun.diffuse = Color3.FromHexString(d.sunColor)
    hemi.intensity = d.hemi
    hemi.diffuse = Color3.FromHexString(d.skyColor)
    fill.intensity = d.daytime ? 0.22 : 0.3
    fill.diffuse = Color3.FromHexString(d.skyColor)
    scene.fogColor = Color3.FromHexString(d.fog)
    scene.imageProcessingConfiguration.exposure = d.exposure
    const c = Color3.FromHexString(d.sky[2])
    scene.clearColor = new Color4(c.r, c.g, c.b, 1)
    paintSky(sky, d.sky)
    // тени перерисовываются один раз после правки — просим их обновиться
    shadow.getShadowMap()?.resetRefreshCounter()
    this.invalidate(900)
  }

  /** Пауза рендера — когда 3D скрыт (открыт редактор плана). */
  setPaused(p: boolean): void {
    this.paused = p
    if (!p) this.invalidate(1500)
  }

  private watchFps(now: number): void {
    // автотесты идут в браузере без видеокарты — там кадров всегда мало
    if (this.fpsWarned || (typeof navigator !== "undefined" && navigator.webdriver)) return
    const fps = this.bundle.engine.getFps()
    if (fps >= 24 || !Number.isFinite(fps)) { this.fpsLowSince = 0; return }
    if (!this.fpsLowSince) this.fpsLowSince = now
    else if (now - this.fpsLowSince > 3000) {
      this.fpsWarned = true
      this.onLowFps()
    }
  }

  tool: Tool = "select"
  mepSystem: MepSystem = "power"
  /** перепланировка: новые стены/проёмы помечаются «новая», удаление — демонтаж */
  replanMode = false
  private wallDefaults(def: typeof DEFAULT_WALL = DEFAULT_WALL): typeof DEFAULT_WALL {
    return this.replanMode ? { ...def, phase: "new" } : def
  }
  mepDeviceKind = "socket"
  private mepPoints: Vec2[] = []
  private mepPreview: TransformNode | null = null
  private sectionStart: Vec2 | null = null
  annotateKind: "dim" | "text" = "dim"
  private dimA: Vec2 | null = null
  private dimB: Vec2 | null = null
  private dimPreview: TransformNode | null = null
  private sectionPreview: TransformNode | null = null
  activeFloorId = ""

  /**
   * Режим «Участок»: этаж выбранного элемента. Здание видно целиком, а править
   * можно окно третьего этажа, не переключая уровень.
   */
  siteFloorId = ""

  /** Этаж, с которым работают инструменты: активный, а на участке — выбранный. */
  private get toolFloorId(): string {
    return this.activeFloorId || this.siteFloorId
  }
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
  snapEnabled = true // привязка к сетке (стены 100мм, объекты 50мм); тумблер G
  onPick: (meta: MeshMeta | null) => void = () => {}
  onMultiToggle: (objectId: string) => void = () => {}
  /** рамка выделения в CSS-пикселях (null — скрыть) */
  onBox: (rect: { x1: number; y1: number; x2: number; y2: number } | null) => void = () => {}
  /** стены, попавшие в рамку; additive — добавить к выделению (Shift) */
  onBoxSelect: (ids: string[], additive: boolean) => void = () => {}
  onLinkRoom: (floorId: string, roomId: string) => void = () => {}
  onCommand: (cmd: Command) => void = () => {}
  onHud: (text: string | null) => void = () => {}
  /** экранные подписи активного этажа — раз в кадр */
  onLabels: (labels: ScreenLabel[]) => void = () => {}
  /** координаты курсора на плоскости этажа, мм */
  onCursor: (mm: Vec2 | null) => void = () => {}
  private labelAnchors: Array<
    | { kind: "wall"; id: string; floorId: string; world: Vector3; lengthMm: number; angleDeg: number }
    | { kind: "room"; id: string; floorId: string; world: Vector3; areaMm2: number }
    | { kind: "note"; id: string; floorId: string; world: Vector3; text: string; dim: boolean; angleDeg: number }
  > = []
  // подписи, закрытые чужой геометрией (этажом выше, соседним корпусом)
  private occludedLabels = new Set<string>()
  private lastOcclusionAt = 0
  private lastCursorAt = 0
  /** рулетка: отрезок задан, длина в мм плана */
  onMeasure: (lengthMm: number, from: Vec2, to: Vec2) => void = () => {}
  private measureStart: Vector3 | null = null
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
    this.bundle.scene.onBeforeRenderObservable.add(() => this.syncCamera())
    // Перф для слабых ПК: сцена статична между действиями — кадр рисуется только
    // когда что-то меняется (камера, мышь, клавиши, правка) и немного после.
    // Раньше рендер шёл 60 раз в секунду всегда и грузил видеокарту на 100 %.
    this.bundle.scene.onPointerObservable.add(() => this.invalidate(700))
    const onKey = (e: KeyboardEvent) => {
      // Shift — бег (как в играх), отпустили — снова шаг
      if (this.walkCamera) this.walkCamera.speed = e.type === "keydown" && e.shiftKey ? WALK_SPEED * RUN_FACTOR : WALK_SPEED
      this.invalidate(1500)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("keyup", onKey)
    this.detachKeys = () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("keyup", onKey)
    }
    this.invalidate(2000)
    this.setAmbientOcclusion(true)
    this.bundle.engine.runRenderLoop(() => {
      if (this.paused) return
      // обход: камера падает и идёт сама — кадры нужны постоянно
      if (this.walkCamera && this.bundle.scene.activeCamera === this.walkCamera) this.invalidate(200)
      const now = performance.now()
      if (now > this.renderUntil) return
      this.bundle.scene.render()
      // камера ещё движется (инерция, анимация) — продлеваем
      const cam = this.bundle.scene.activeCamera
      if (cam) {
        const m = cam.getViewMatrix().asArray()
        const last = this.lastView
        let moved = !last
        if (last) for (let i = 0; i < 16; i++) if (Math.abs(m[i] - last[i]) > 1e-6) { moved = true; break }
        if (moved) {
          this.lastView = m.slice()
          this.invalidate(300)
        }
      }
      this.watchFps(now)
    })
    // Подписи проецируем после кадра: камера уже на месте, дёшево даже на сотнях якорей
    this.bundle.scene.onAfterRenderObservable.add(() => this.projectLabels())
  }

  getFps(): number {
    return this.bundle.engine.getFps()
  }

  // Турбо-режим (§24): рендер в пониженном разрешении (меньше пикселей — выше FPS) и
  // более лёгкие тени. Геометрия и интерактив не меняются.
  private liteMode = false

  setTurbo(on: boolean): void {
    // в лёгком режиме декоративная геометрия не строится — это главная экономия
    // на слабых видеокартах; переключение требует пересборки сцены
    if (on !== this.liteMode) {
      this.liteMode = on
      if (this.lastDoc && this.lastCtx) this.rebuild(this.lastDoc, { ...this.lastCtx, lite: on })
    }
    // лёгкий режим: меньше пикселей, без теней, свечения, тумана и затенения углов
    this.bundle.engine.setHardwareScalingLevel(on ? 1.5 : 1)
    this.bundle.shadow.useBlurExponentialShadowMap = !on
    this.bundle.sun.shadowEnabled = !on
    this.bundle.glow.isEnabled = !on
    this.bundle.scene.fogEnabled = !on
    this.setAmbientOcclusion(!on)
    this.invalidate(800)
  }

  private ssao: SSAO2RenderingPipeline | null = null

  /**
   * Мягкое затенение в углах и стыках (SSAO). Без него интерьер выглядит
   * «нарисованным»: стены, пол и мебель сливаются в одно плоское пятно.
   * В лёгком режиме выключается — это самый дорогой эффект сцены.
   */
  setAmbientOcclusion(on: boolean): void {
    const { scene, camera } = this.bundle
    if (!on) {
      this.ssao?.dispose()
      this.ssao = null
      this.invalidate(500)
      return
    }
    if (this.ssao) return
    try {
      // привязываем к активной камере: иначе после перехода в обход на экране
      // оставалась картинка прежней камеры
      const active = scene.activeCamera ?? camera
      const ao = new SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1 }, [active])
      ao.radius = 1.1
      ao.totalStrength = 0.9
      ao.samples = 12
      ao.expensiveBlur = false
      ao.maxZ = 60
      this.ssao = ao
    } catch {
      this.ssao = null // старые видеокарты без нужных расширений — просто без затенения
    }
    this.invalidate(800)
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
    this.invalidate(1500)
    // текстуры (подложка, материалы) догружаются — кадр после готовности
    scene.executeWhenReady(() => this.invalidate(600))
    this.lastCtx = ctx
    this.lastDoc = doc
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
    // якоря подписей заново: у «Участка» и пустого этажа их нет
    this.labelAnchors = []
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
      if (!(ctx.lite ?? this.liteMode)) this.buildApron(b, bRoot, scene)
      const planeY = active ? active.elevation * S : 0
      for (const sec of b.sections ?? []) this.drawSectionLine(bRoot, sec, planeY, false)
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
    if (this.drafting) this.applyDraftLook()
    this.updateGrips()
  }

  // ── Чертёжный вид для «Плана» ────────────────────────────────────────────────
  // Сверху текстуры пола, тени и трава мешают читать план: стены — тёмные
  // полосы, помещения — белые, статус аренды — цветом поверх, участок — светлый.
  private drafting = false
  private lastDoc: BuilderDocument | null = null
  private groundMaterialBackup: import("@babylonjs/core").Material | null = null

  private setDrafting(on: boolean): void {
    if (this.drafting === on) return
    this.drafting = on
    // свечение раздувало белую заливку чертежа в сплошной засвет
    this.bundle.glow.isEnabled = !on
    const ground = this.bundle.ground
    // цвет участка идёт из вершинных цветов (трава/песок) — в чертеже их гасим
    ground.useVertexColors = !on
    // сетка участка лежит выше пола помещений и штриховала весь план
    this.bundle.scene.getMeshByName("gridPlane")?.setEnabled(!on)
    if (on) {
      this.groundMaterialBackup = ground.material
      ground.material = this.reg.flat("#e9edf2")
    } else if (this.groundMaterialBackup) {
      ground.material = this.groundMaterialBackup
      this.groundMaterialBackup = null
    }
    // вернуть или заменить материалы геометрии — пересборкой с теми же данными
    if (this.lastDoc && this.lastCtx) this.rebuild(this.lastDoc, this.lastCtx)
  }

  private applyDraftLook(): void {
    if (!this.docRoot) return
    const room = this.reg.flat("#ffffff")
    const wall = this.reg.flat("#1f2937")
    const opening = this.reg.flat("#bae6fd")
    for (const m of this.docRoot.getChildMeshes()) {
      const kind = (m.metadata as MeshMeta | null)?.kind
      if (kind === "room") m.material = room
      else if (kind === "wall") {
        const phase = (m.metadata as { phase?: string } | null)?.phase
        m.material = phase === "demolish" ? this.reg.flat("#f87171") : phase === "new" ? this.reg.flat("#15803d") : wall
      }
      else if (kind === "opening") {
        // как на чертеже — разрез на высоте ~1,2 м: проём виден разрывом в стене,
        // а не прячется под перемычкой
        m.material = opening
        m.renderingGroupId = 1
      }
      else if (kind === "mep-run" || kind === "mep-device") m.renderingGroupId = 1
      m.receiveShadows = false
    }
    // крыши закрывают план сверху
    for (const roof of this.roofByFloorId.values()) roof.setEnabled(false)
  }

  // Ручки-узлы у выделенной стены. Узлы по всему этажу хватались случайно и
  // утаскивали углы здания; теперь угол двигается, только если сначала выбрать
  // стену и взять её ручку.
  private updateGrips(): void {
    for (const g of this.grips) g.dispose()
    this.grips = []
    const sel = this.currentSel
    const doc = this.getDoc()
    if (!doc || !sel?.id || !sel.floorId || (sel.type !== "wall" && sel.type !== "node")) return
    const f = findFloor(doc, sel.floorId)
    const root = this.floorRootById.get(sel.floorId)
    if (!f || !root) return
    const ids = sel.type === "node" ? [sel.id] : (() => {
      const e = f.wallGraph.edges[sel.id as string]
      return e ? [e.a, e.b] : []
    })()
    for (const nid of ids) {
      const n = f.wallGraph.nodes[nid]
      if (!n) continue
      const grip = MeshBuilder.CreateSphere(`grip_${nid}`, { diameter: 0.55, segments: 8 }, this.bundle.scene)
      grip.parent = root
      grip.position.set(n.x * S, 0.15, n.y * S)
      grip.material = this.reg.status("#38BDF8")
      grip.renderingGroupId = 1
      grip.metadata = { kind: "node", floorId: f.id, entityId: nid }
      this.grips.push(grip)
    }
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
        if (st.toFloorId === f.id && st.shape !== "porch" && st.shape !== "column") holes.push(stairHoleWorld(st, other.height))
      }
    }

    // Цоколь — у самого нижнего этажа (он и стоит на земле), карниз — у верхнего.
    // Без них здание выглядит голой коробкой.
    const elevations = b.floors.map((fl) => fl.elevation)
    const plinthAt = Math.min(...elevations)
    const lite = ctx.lite ?? this.liteMode
    const walls = buildWalls(f, fNode, scene, this.reg, {
      plinth: !lite && f.elevation === plinthAt,
      cornice: !lite && f.elevation === Math.max(...elevations),
      lite,
    })
    const floorMeshes = buildFloors(f, fNode, scene, this.reg, this.statusResolver, holes, lite)
    // Скан плана на полу — чуть выше пола, чтобы не мерцал с перекрытием.
    // Не пикается: клики сквозь него попадают в пол/стены.
    if (f.underlay) {
      const u = f.underlay
      const w = u.widthMm * S
      const h = (u.widthMm / (u.aspect || 1)) * S
      const plane = MeshBuilder.CreateGround(`underlay_${f.id}`, { width: w, height: h }, scene)
      plane.parent = fNode
      // выше сетки участка (0.06) — иначе клетка ложилась поверх скана и мешала обводке
      plane.position.set(u.x * S + w / 2, 0.08, u.y * S + h / 2)
      plane.rotation.y = (u.rotationDeg * Math.PI) / 180
      plane.isPickable = false
      const mat = new StandardMaterial(`underlay_m_${f.id}`, scene)
      const tex = new Texture(u.url, scene, false, false)
      // картинка плана: верх картинки — «север» плана, без зеркала
      tex.vScale = -1
      // DXF-подложка — прозрачная PNG: без этого пустота становится чёрной
      tex.hasAlpha = true
      mat.useAlphaFromDiffuseTexture = true
      mat.diffuseTexture = tex
      mat.emissiveTexture = tex
      mat.disableLighting = true
      mat.alpha = u.opacity
      mat.backFaceCulling = false
      plane.material = mat
    }
    if (reg) {
      for (const m of walls) {
        this.registerMesh(m.metadata?.entityId, m)
        this.bundle.shadow.addShadowCaster(m)
      }
      for (const m of floorMeshes) this.registerMesh(m.metadata?.entityId, m)
    }

    for (const st of f.stairs) {
      const node = buildStair(st, f.height, fNode, scene, this.reg, lite)
      if (reg) {
        node.getChildMeshes().forEach((m) => {
          if (m instanceof Mesh) {
            this.registerMesh(st.id, m)
            this.bundle.shadow.addShadowCaster(m)
          }
        })
      }
    }

    // автомебель по назначению помещений — только в полном режиме
    if (this.showFurniture && !lite) {
      for (const m of buildFurnish(f, floorRooms(f), fNode, scene)) {
        m.receiveShadows = true
        this.bundle.shadow.addShadowCaster(m)
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

    // якоря подписей активного этажа: середины стен и центры комнат
    if (active && f.id === active.id && reg) {
      const anchors: typeof this.labelAnchors = []
      const ox = b.origin.x * S
      const oz = b.origin.y * S
      const y = f.elevation * S + 0.3
      const arcParts = arcSegmentIds(f.wallGraph)
      for (const eid in f.wallGraph.edges) {
        const e = f.wallGraph.edges[eid]
        const a = f.wallGraph.nodes[e.a]
        const c = f.wallGraph.nodes[e.b]
        if (!a || !c) continue
        // участки дуги не подписываем по отдельности — иначе дуга в «0.60»
        if (arcParts.has(eid)) continue
        anchors.push({
          kind: "wall",
          id: eid,
          floorId: f.id,
          world: new Vector3(ox + ((a.x + c.x) / 2) * S, y, oz + ((a.y + c.y) / 2) * S),
          lengthMm: Math.hypot(c.x - a.x, c.y - a.y),
          angleDeg: (Math.atan2(c.y - a.y, c.x - a.x) * 180) / Math.PI,
        })
      }
      for (const room of floorRooms(f)) {
        const c = centroid(room.polygon)
        anchors.push({ kind: "room", id: room.id, floorId: f.id, world: new Vector3(ox + c.x * S, y, oz + c.y * S), areaMm2: room.areaMm2 })
      }
      for (const an of f.annotations ?? []) {
        if (an.kind === "dim") {
          const g = dimGeometry(an.a, an.b, an.offset)
          anchors.push({ kind: "note", id: an.id, floorId: f.id, world: new Vector3(ox + g.mid.x * S, y, oz + g.mid.y * S), text: String(Math.round(g.lengthMm)), dim: true, angleDeg: g.angleDeg })
        } else {
          anchors.push({ kind: "note", id: an.id, floorId: f.id, world: new Vector3(ox + an.at.x * S, y, oz + an.at.y * S), text: an.text, dim: false, angleDeg: 0 })
        }
      }
      this.labelAnchors = anchors
    }

    if (active && f.id === active.id) this.drawAnnotations(f, fNode)
    const mepMeshes = buildMep(f, fNode, scene, new Set(ctx.mepLayers ?? MEP_SYSTEMS), this.drafting)
    if (reg) for (const m of mepMeshes) this.registerMesh(m.metadata?.entityId, m)

    // столкновения для обхода задаются сразу при сборке
    for (const m of fNode.getChildMeshes()) {
      const kind = (m.metadata as MeshMeta | null)?.kind
      if (m instanceof Mesh && kind && SOLID_KINDS.has(kind)) m.checkCollisions = true
    }

    // текстуры в реальном масштабе (объекты — со своей развёрткой)
    const objectMeshes = new Set(f.objects.flatMap((o) => this.objectRootById.get(o.id)?.getChildMeshes() ?? []))
    worldUVFor([...fNode.getChildMeshes().filter((m) => !objectMeshes.has(m)), ...(roof ? [roof] : [])])
    if (!this.showTenants) for (const m of fNode.getChildMeshes()) if ((m.metadata as MeshMeta | null)?.kind === "status") m.setEnabled(false)
    this.applyFloorVisibility(f, fNode, roof, ctx, active)
    if (ctx.mepFocus && active && f.id === active.id && fNode.isEnabled()) {
      const mepSet = new Set(mepMeshes)
      for (const m of fNode.getChildMeshes()) if (!mepSet.has(m as Mesh)) m.visibility = Math.min(m.visibility, 0.28)
    }
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
    this.invalidate(600)
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
    this.invalidate(600)
    this.currentSel = sel
    this.applyHighlight()
    this.updateGrips()
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
    this.invalidate(1500)
    const { scene, camera } = this.bundle
    const canvas = this.bundle.engine.getRenderingCanvas()
    if (mode === "walk") {
      if (!this.walkCamera) {
        // человек, а не «нокли́п»: рост 1,7 м, сила тяжести, столкновения со
        // стенами, полом, лестницами и мебелью. Взгляд вверх не поднимает — по
        // полу идёт только горизонтальная составляющая шага.
        const wc = new UniversalCamera("walk", new Vector3(0, 1.7, -16), scene)
        wc.minZ = 0.05
        wc.speed = WALK_SPEED
        wc.angularSensibility = 2600
        wc.inertia = 0.5
        wc.keysUp = [87, 38]
        wc.keysDown = [83, 40]
        wc.keysLeft = [65, 37]
        wc.keysRight = [68, 39]
        wc.keysUpward = []
        wc.keysDownward = []
        wc.checkCollisions = true
        wc.applyGravity = true
        // Babylon сам опускает центр эллипсоида на его полувысоту: с радиусом
        // EYE/2 и нулевым смещением глаза оказываются ровно в 1,7 м над полом.
        wc.ellipsoid = new Vector3(0.32, EYE / 2, 0.32)
        wc.ellipsoidOffset = Vector3.Zero()
        wc.onAfterCheckInputsObservable.add(() => { wc.cameraDirection.y = 0 })
        scene.collisionsEnabled = true
        // сильная гравитация «прижимала» коллайдер к полу и съедала шаг:
        // при −0,35 человек полз со скоростью 0,4 м/с
        scene.gravity = new Vector3(0, -0.12, 0)
        this.walkCamera = wc
      }
      camera.detachControl()
      scene.activeCamera = this.walkCamera
      if (canvas) this.walkCamera.attachControl(canvas, true)
      // мышь ведёт взгляд без зажатой кнопки: клик по сцене захватывает указатель
      this.enterPointerLock(canvas)
      // внутри здания должен быть потолок: в обходе показываем все этажи
      this.onWalkEnter()
      this.enableWalkCollisions()
      this.walkSpawn()
      this.refreshAmbientOcclusion()
      return
    }
    this.exitPointerLock()
    if (this.walkCamera) this.walkCamera.detachControl()
    scene.activeCamera = camera
    if (canvas) camera.attachControl(canvas, true)
    this.refreshAmbientOcclusion()
    camera.mode = mode === "plan" ? Camera.ORTHOGRAPHIC_CAMERA : Camera.PERSPECTIVE_CAMERA
    this.setDrafting(mode === "plan")
    const flat = mode === "top" || mode === "plan"
    // План — строго сверху и без поворота: чертёж не должен заваливаться от
    // случайного движения мыши. Раньше предел наклона 0.15 рад не давал камере
    // встать вертикально, и «план» был перспективой с видимыми боками стен.
    // не ровно 0: при beta = 0 взгляд параллелен «верху» камеры и вид вырождается
    const TOP = 0.0001
    camera.lowerBetaLimit = flat ? TOP : 0.15
    camera.upperBetaLimit = mode === "plan" ? TOP : Math.PI / 2.05
    camera.lowerAlphaLimit = mode === "plan" ? -Math.PI / 2 : null
    camera.upperAlphaLimit = mode === "plan" ? -Math.PI / 2 : null
    camera.alpha = flat ? -Math.PI / 2 : -Math.PI / 4
    camera.beta = flat ? TOP : Math.PI / 3.2
    if (flat) this.frameActiveFloor()
    this.syncCamera()
  }

  // Каждый кадр: ортогональные границы следуют за зумом (иначе колесо в плане
  // ничего не делало), скорость панорамы — за расстоянием до цели.
  private syncCamera(): void {
    const camera = this.bundle.camera
    // Панорама (ПКМ) должна идти ровно за курсором: сколько метров в пикселе на
    // текущем расстоянии, столько и сдвигаем. Раньше коэффициент был «на глаз» и
    // при приближении панорама почти останавливалась.
    // высота холста в CSS-пикселях: мышь двигается в них, а рендер может идти в
    // пониженном разрешении (лёгкий режим) — иначе панорама считалась бы вдвое
    const h = Math.max(1, this.bundle.engine.getRenderHeight() * this.bundle.engine.getHardwareScalingLevel())
    const ortho = camera.mode === Camera.ORTHOGRAPHIC_CAMERA
    const metersPerPx = ortho ? camera.radius / h : (2 * Math.max(0.5, camera.radius) * Math.tan(camera.fov / 2)) / h
    // Babylon копит панораму по инерции: за кадром сдвиг px/sens, а всего —
    // px/(sens·(1−panningInertia)). Без этого множителя вид улетал в 10 раз
    // дальше курсора и здание пропадало с экрана.
    const damp = Math.max(0.05, 1 - camera.panningInertia)
    camera.panningSensibility = Math.min(40000, Math.max(4, 1 / (metersPerPx * damp)))
    if (!ortho) return
    const half = camera.radius * 0.5
    const aspect = this.bundle.engine.getAspectRatio(camera)
    camera.orthoTop = half
    camera.orthoBottom = -half
    camera.orthoLeft = -half * aspect
    camera.orthoRight = half * aspect
  }

  /** Навести камеру на активный этаж: по его стенам, а если стен нет — на всё. */
  frameActiveFloor(): void {
    const doc = this.getDoc()
    const f = doc && this.activeFloorId ? findFloor(doc, this.activeFloorId) : undefined
    const nodes = f ? Object.values(f.wallGraph.nodes) : []
    if (!f || nodes.length === 0) {
      this.frameAll()
      return
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
    }
    const cam = this.bundle.camera
    const aspect = this.bundle.engine.getAspectRatio(cam) || 1
    const w = (maxX - minX) * S
    const h = (maxY - minY) * S
    cam.setTarget(new Vector3(((minX + maxX) / 2) * S, this.activeFloorPlaneY(), ((minY + maxY) / 2) * S))
    // Панели закрывают края: сверху полоса инструментов, слева этажи, справа
    // свойства. Этаж должен целиком влезть в оставшуюся середину экрана.
    cam.radius = Math.max(4, Math.max(h / 0.62, w / aspect / 0.62) + 2)
  }

  /**
   * Отмостка: бетонная полоса метровой ширины вдоль каждой наружной стены.
   * Раньше строилась единым контуром — на сложной форме здания (пристройки,
   * тамбуры) контур мог вывернуться и «выстрелить» полосой в сторону.
   */
  private buildApron(b: Building, bRoot: TransformNode, scene: import("@babylonjs/core").Scene): void {
    const APRON = 1000
    // берём этаж с самым полным наружным контуром: у подвала он часто обрезан
    const floors = [...b.floors].sort(
      (p, q) =>
        Object.values(q.wallGraph.edges).filter((e) => e.kind === "exterior").length -
        Object.values(p.wallGraph.edges).filter((e) => e.kind === "exterior").length,
    )
    for (const f of floors) {
      const ext = Object.values(f.wallGraph.edges).filter((e) => e.kind === "exterior")
      if (!ext.length) continue
      // наружу — сторона, противоположная центру этажа
      let cx = 0, cy = 0, n = 0
      for (const id in f.wallGraph.nodes) { cx += f.wallGraph.nodes[id].x; cy += f.wallGraph.nodes[id].y; n++ }
      if (!n) continue
      cx /= n; cy /= n
      for (const e of ext) {
        const a = f.wallGraph.nodes[e.a], c = f.wallGraph.nodes[e.b]
        if (!a || !c) continue
        const len = Math.hypot(c.x - a.x, c.y - a.y)
        if (len < 200) continue
        const u = { x: (c.x - a.x) / len, y: (c.y - a.y) / len }
        let nr = { x: -u.y, y: u.x }
        const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }
        if ((mid.x - cx) * nr.x + (mid.y - cy) * nr.y < 0) nr = { x: -nr.x, y: -nr.y }
        const d = e.thickness / 2 + APRON / 2
        const strip = MeshBuilder.CreateBox(`apron_${f.id}_${e.id}`, { width: (len + e.thickness) * S, height: 0.06, depth: APRON * S }, scene)
        strip.position.set((mid.x + nr.x * d) * S, 0.0, (mid.y + nr.y * d) * S)
        strip.rotation.y = -Math.atan2(u.y, u.x)
        strip.material = this.reg.get("concrete")
        strip.receiveShadows = true
        strip.isPickable = false
        strip.parent = bRoot
        strip.metadata = { kind: "site" }
      }
      break // достаточно контура одного этажа — нижнего с наружными стенами
    }
  }

  /** Пересобрать затенение под активную камеру (после смены камеры). */
  private refreshAmbientOcclusion(): void {
    if (!this.ssao) return
    this.setAmbientOcclusion(false)
    this.setAmbientOcclusion(true)
  }

  /** Захват указателя: в обходе мышь вращает взгляд, как в играх. */
  pointerLockRequested = false
  private pointerLockHandler: ((e: MouseEvent) => void) | null = null

  private enterPointerLock(canvas: HTMLCanvasElement | null): void {
    if (!canvas || this.pointerLockHandler) return
    const onClick = () => {
      // повторный клик после выхода из захвата возвращает обзор мышью
      try { this.bundle.engine.enterPointerlock() } catch { /* браузер может отказать */ }
    }
    canvas.addEventListener("click", onClick)
    this.pointerLockHandler = onClick
    this.pointerLockRequested = true
    onClick()
  }

  private exitPointerLock(): void {
    const canvas = this.bundle.engine.getRenderingCanvas()
    if (this.pointerLockHandler && canvas) canvas.removeEventListener("click", this.pointerLockHandler)
    this.pointerLockHandler = null
    this.pointerLockRequested = false
    try { this.bundle.engine.exitPointerlock() } catch { /* не были в захвате */ }
  }

  /** Вход в обход: этажи выше должны быть видимы, иначе над головой небо. */
  onWalkEnter: () => void = () => {}

  /** Всё, обо что можно удариться или на что встать: стены, полы, лестницы, крыши, объекты. */
  private enableWalkCollisions(): void {
    if (!this.docRoot) return
    this.docRoot.getChildMeshes().forEach((m) => {
      const kind = (m.metadata as MeshMeta | null)?.kind
      if (m instanceof Mesh && kind && SOLID_KINDS.has(kind)) m.checkCollisions = true
    })
    this.bundle.ground.checkCollisions = true
  }

  /** Встать в самое большое помещение активного этажа лицом вдоль него. */
  private walkSpawn(): void {
    const wc = this.walkCamera
    const doc = this.getDoc()
    const f = doc && this.toolFloorId ? findFloor(doc, this.toolFloorId) : undefined
    if (!wc || !f) return
    const b = doc?.buildings.find((bd) => bd.floors.some((fl) => fl.id === f.id))
    const ox = (b?.origin.x ?? 0) * S, oz = (b?.origin.y ?? 0) * S
    const rooms = floorRooms(f)
    const best = rooms.sort((p, q) => q.areaMm2 - p.areaMm2)[0]
    const y = f.elevation * S + 0.08
    if (!best) {
      wc.position.set(ox, y + EYE, oz - 14)
      wc.setTarget(new Vector3(ox, y + EYE, oz))
      return
    }
    // точка внутри помещения, подальше от стен, лестниц, колонн и мебели:
    // иначе человек появлялся внутри лестницы и его выталкивало на крышу
    const blocks: Vec2[][] = [
      ...(best.holes ?? []),
      ...f.stairs.map((st) => stairHoleWorld(st, f.height)),
      ...f.objects.map((ob) => objectCorners(ob)),
    ]
    const c = labelPoint(best.polygon, blocks)
    wc.position.set(ox + c.x * S, y + EYE, oz + c.y * S)
    // смотреть вдоль длинной стороны помещения
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of best.polygon) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }
    const along = maxX - minX >= maxY - minY ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1)
    wc.setTarget(wc.position.add(along.scale(4)))
    this.invalidate(1500)
  }

  // Поворот орбитальной камеры к заданному ракурсу (ViewCube). Возврат к перспективе.
  orbitTo(alpha: number, beta: number): void {
    const { scene, camera } = this.bundle
    const canvas = this.bundle.engine.getRenderingCanvas()
    if (this.walkCamera) this.walkCamera.detachControl()
    scene.activeCamera = camera
    if (canvas) camera.attachControl(canvas, true)
    camera.mode = Camera.PERSPECTIVE_CAMERA
    camera.lowerBetaLimit = 0.0001
    camera.upperBetaLimit = Math.PI / 2.05
    camera.lowerAlphaLimit = null
    camera.upperAlphaLimit = null
    camera.alpha = alpha
    camera.beta = beta
  }

  // ── Указатель ────────────────────────────────────────────────────────────────
  private setupPointer(): void {
    const scene = this.bundle.scene
    scene.onPointerObservable.add((pi) => {
      const ev = pi.event as { shiftKey?: boolean; button?: number }
      this.shiftDown = !!ev?.shiftKey
      // Правая и средняя кнопки — только камера (вращение/панорама). Раньше
      // панорама, начатая со стены, двигала стену.
      const primary = (ev?.button ?? 0) === 0
      const scene = this.bundle.scene
      if (pi.type === PointerEventTypes.POINTERDOWN) {
        if (!primary) return
        this.press = { x: scene.pointerX, y: scene.pointerY }
        this.handleDown()
      } else if (pi.type === PointerEventTypes.POINTERMOVE) this.handleMove()
      else if (pi.type === PointerEventTypes.POINTERUP) {
        const press = this.press
        if (primary) this.press = null
        this.handleUp()
        // Клик распознаём сами: нажали и отпустили на месте. Babylon считал два
        // быстрых клика в разных точках двойным и второй терял — при обводке
        // стен цепочкой пропадали точки.
        if (primary && press && !passedDragThreshold(press.x, press.y, scene.pointerX, scene.pointerY)) this.handleTap()
      }
    })
  }

  private pickMeta(): { meta: MeshMeta | null; point: Vector3 | null } {
    const { scene } = this.bundle
    // ручка рисуется поверх стен — и хватается сквозь них
    if (this.grips.length) {
      const g = scene.pick(scene.pointerX, scene.pointerY, (m) => (m.metadata as MeshMeta | null)?.kind === "node")
      if (g?.hit && g.pickedMesh) return { meta: g.pickedMesh.metadata as MeshMeta, point: g.pickedPoint ?? null }
    }
    const pick = scene.pick(scene.pointerX, scene.pointerY)
    const meta = (pick?.pickedMesh?.metadata ?? null) as MeshMeta | null
    // Стена в плане — линия в пару пикселей: в неё не попасть. Как в CAD, берём
    // ближайшую стену активного этажа в допуске 8 px, если под курсором пол,
    // комната или пусто.
    const lineTools = this.tool === "select" || this.tool === "delete" || this.tool === "door" || this.tool === "window"
    if ((this.tool === "select" || this.tool === "delete") && (!meta || meta.kind === "room" || meta.kind === "floor" || meta.kind === "wall")) {
      const sec = this.nearestSectionAtPointer(8)
      if (sec) return { meta: sec, point: pick?.pickedPoint ?? null }
      const note = this.nearestAnnotationAtPointer(10)
      if (note) return { meta: note, point: pick?.pickedPoint ?? null }
      const mep = this.nearestMepAtPointer(8)
      if (mep) return { meta: mep, point: pick?.pickedPoint ?? null }
    }
    if (lineTools && (!meta || meta.kind === "room" || meta.kind === "floor")) {
      const near = this.nearestWallAtPointer(8)
      if (near) return { meta: { kind: "wall", floorId: near.floorId, entityId: near.edgeId } as MeshMeta, point: near.point }
    }
    return { meta, point: pick?.pickedPoint ?? null }
  }

  private planeAtScreen(x: number, y: number): Vector3 | null {
    const { scene, camera } = this.bundle
    const cam = scene.activeCamera ?? camera
    const ray = scene.createPickingRay(x, y, Matrix.Identity(), cam)
    const planeY = this.activeFloorPlaneY()
    if (Math.abs(ray.direction.y) < 1e-6) return null
    const t = (planeY - ray.origin.y) / ray.direction.y
    return t < 0 ? null : ray.origin.add(ray.direction.scale(t))
  }

  private nearestWallAtPointer(tolPx: number): { floorId: string; edgeId: string; point: Vector3 } | null {
    const doc = this.getDoc()
    const f = doc && this.toolFloorId ? findFloor(doc, this.toolFloorId) : undefined
    if (!f) return null
    const { scene } = this.bundle
    const p = this.planeAtScreen(scene.pointerX, scene.pointerY)
    const q = this.planeAtScreen(scene.pointerX + tolPx, scene.pointerY)
    if (!p || !q) return null
    const pm = { x: p.x * 1000, y: p.z * 1000 }
    const tolMm = Math.hypot(q.x - p.x, q.z - p.z) * 1000
    let best: { edgeId: string; dist: number } | null = null
    for (const id in f.wallGraph.edges) {
      const e = f.wallGraph.edges[id]
      const a = f.wallGraph.nodes[e.a]
      const b = f.wallGraph.nodes[e.b]
      if (!a || !b) continue
      const { dist } = closestOnSegment(pm, a, b)
      const limit = tolMm + e.thickness / 2
      if (dist <= limit && (!best || dist < best.dist)) best = { edgeId: id, dist }
    }
    return best ? { floorId: f.id, edgeId: best.edgeId, point: p } : null
  }

  private activeFloorPlaneY(): number {
    const doc = this.getDoc()
    if (!doc) return 0
    const f = findFloor(doc, this.toolFloorId)
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

  private nearestNodeMm(mmX: number, mmY: number, radius = SNAP_NODE_MM): Vec2 | null {
    const doc = this.getDoc()
    const f = doc ? findFloor(doc, this.toolFloorId) : undefined
    if (!f) return null
    let best: Vec2 | null = null
    let bestD = radius
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

  /** Сколько миллиметров плана в `px` пикселях экрана у курсора. */
  private pxToMm(px: number): number {
    const { scene } = this.bundle
    const p = this.planeAtScreen(scene.pointerX, scene.pointerY)
    const q = this.planeAtScreen(scene.pointerX + px, scene.pointerY)
    return p && q ? Math.hypot(q.x - p.x, q.z - p.z) * 1000 : SNAP_NODE_MM
  }

  /** Ближайшая точка на стене активного этажа в радиусе (для Т-примыкания). */
  private nearestOnWallMm(mmX: number, mmY: number, radius: number): Vec2 | null {
    const doc = this.getDoc()
    const f = doc ? findFloor(doc, this.toolFloorId) : undefined
    if (!f) return null
    let best: { p: Vec2; d: number } | null = null
    for (const id in f.wallGraph.edges) {
      const e = f.wallGraph.edges[id]
      const a = f.wallGraph.nodes[e.a]
      const b = f.wallGraph.nodes[e.b]
      if (!a || !b) continue
      const c = closestOnSegment({ x: mmX, y: mmY }, a, b)
      if (c.dist <= radius && (!best || c.dist < best.d)) best = { p: c.point, d: c.dist }
    }
    return best ? { x: Math.round(best.p.x), y: Math.round(best.p.y) } : null
  }

  // Точка стены. Объектные привязки важнее полярных, как в AutoCAD: узел →
  // точка на стене (Т-примыкание) → от начала: длина шагом и угол 15°/90° →
  // сетка. Радиус привязки — 12 px экрана, одинаково удобно на любом зуме.
  private snapKind: "node" | "edge" | null = null
  private resolveWallPoint(world: Vector3): { mm: Vec2; world: Vector3 } {
    let mmX = world.x * 1000
    let mmY = world.z * 1000
    const radius = Math.max(40, this.pxToMm(12))
    const node = this.nearestNodeMm(mmX, mmY, radius)
    const onWall = node ? null : this.nearestOnWallMm(mmX, mmY, radius)
    this.snapKind = node ? "node" : onWall ? "edge" : null
    if (node) {
      mmX = node.x
      mmY = node.y
    } else if (onWall) {
      mmX = onWall.x
      mmY = onWall.y
    } else if (this.wallStart) {
      const sx = this.wallStart.x * 1000
      const sy = this.wallStart.z * 1000
      const vx = mmX - sx
      const vy = mmY - sy
      // Привязка включена: длина шагом 10 см, угол шагом 15°. Выключена —
      // обводка по скану: 1 см и свободный угол. Shift — орто-лок (90°) всегда.
      const distStep = this.snapEnabled ? 100 : 10
      const dist = Math.max(distStep, snapToGrid(Math.hypot(vx, vy), distStep))
      const raw = Math.atan2(vy, vx)
      const step = this.shiftDown ? Math.PI / 2 : this.snapEnabled ? Math.PI / 12 : 0
      const ang = step ? Math.round(raw / step) * step : raw
      mmX = sx + Math.cos(ang) * dist
      mmY = sy + Math.sin(ang) * dist
    } else {
      const g = this.snapEnabled ? 100 : 1
      mmX = snapToGrid(mmX, g)
      mmY = snapToGrid(mmY, g)
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
      if (p && this.toolFloorId) {
        this.roomStart = new Vector3(snapToGrid(p.x * 1000, 100) * S, this.activeFloorPlaneY(), snapToGrid(p.z * 1000, 100) * S)
        this.bundle.scene.activeCamera?.detachControl()
      }
      return
    }
    if (this.tool === "road" || this.tool === "fence" || this.tool === "pave") {
      // Начало рисования протягиванием. Если уже идёт мультиточечный ввод
      // (кликами), drag не перехватываем — пусть работает прежний поток.
      if (this.pathPoints.length === 0 && this.pavePoints.length === 0) {
        const p = this.projectToY(0)
        if (p) {
          this.pathDragStart = { x: snapToGrid(p.x * 1000, 100), y: snapToGrid(p.z * 1000, 100) }
          this.bundle.scene.activeCamera?.detachControl()
        }
      }
      return
    }
    if (this.tool === "select") {
      const { meta } = this.pickMeta()
      const { scene } = this.bundle
      const sx = scene.pointerX
      const sy = scene.pointerY
      const doc = this.getDoc()
      // Двигать можно только то, что уже выделено (ручки — только у выделенного).
      // Нажатие на невыделенное — это клик-выбор или вращение камеры, не сдвиг.
      const selected = !!meta?.entityId && this.currentSel?.id === meta.entityId
      if (meta?.kind === "node" && meta.floorId && meta.entityId && doc) {
        const f = findFloor(doc, meta.floorId)
        const n = f?.wallGraph.nodes[meta.entityId]
        const p = this.projectToPlane()
        if (f && n && p) {
          const neighbors: Vec2[] = []
          for (const eid in f.wallGraph.edges) {
            const e = f.wallGraph.edges[eid]
            const other = e.a === meta.entityId ? e.b : e.b === meta.entityId ? e.a : null
            const on = other ? f.wallGraph.nodes[other] : undefined
            if (on) neighbors.push({ x: on.x, y: on.y })
          }
          this.dragNode = { floorId: meta.floorId, nodeId: meta.entityId, sx, sy, moved: false, orig: { x: n.x, y: n.y }, startMm: { x: p.x * 1000, y: p.z * 1000 }, neighbors }
          scene.activeCamera?.detachControl()
        }
      } else if (!selected) {
        // В плане протяжка по пустому месту или по помещению — рамка выделения
        // (вращать план всё равно нельзя). Клик без протяжки выберет помещение.
        const ortho = scene.activeCamera?.mode === Camera.ORTHOGRAPHIC_CAMERA
        if (ortho && (!meta || meta.kind === "room" || meta.kind === "ground" || meta.kind === "status")) {
          this.box = { sx, sy, moved: false, additive: this.shiftDown }
          scene.activeCamera?.detachControl()
        }
        return
      } else if (meta?.kind === "opening" && meta.floorId && meta.entityId) {
        this.dragOpening = { floorId: meta.floorId, openingId: meta.entityId, sx, sy, moved: false }
        scene.activeCamera?.detachControl()
      } else if (meta?.kind === "stair" && meta.floorId && meta.entityId) {
        this.dragStair = { floorId: meta.floorId, stairId: meta.entityId, sx, sy, moved: false }
        scene.activeCamera?.detachControl()
      } else if (meta?.kind === "wall" && meta.floorId && meta.entityId && doc) {
        const f = findFloor(doc, meta.floorId)
        const e = f?.wallGraph.edges[meta.entityId]
        const a = e ? f?.wallGraph.nodes[e.a] : undefined
        const b = e ? f?.wallGraph.nodes[e.b] : undefined
        const p = this.projectToPlane()
        if (a && b && p) {
          this.dragWall = { floorId: meta.floorId, edgeId: meta.entityId, startMm: { x: p.x * 1000, y: p.z * 1000 }, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, sx, sy, moved: false }
          scene.activeCamera?.detachControl()
        }
      } else if (meta?.kind === "object" && meta.entityId) {
        const target = meta.target === "site" || !meta.target ? ({ site: true } as const) : ({ floorId: meta.target } as const)
        const planeY = "site" in target ? 0 : (findFloor(doc ?? ({} as BuilderDocument), target.floorId)?.elevation ?? 0) * S
        this.dragObject = { target, objectId: meta.entityId, planeY }
        scene.activeCamera?.detachControl()
      }
    }
  }

  private cssScale(): number {
    const canvas = this.bundle.engine.getRenderingCanvas()
    const w = this.bundle.engine.getRenderWidth()
    return canvas && canvas.clientWidth > 0 && w > 0 ? canvas.clientWidth / w : 1
  }

  // Рамка как в AutoCAD: слева направо — стены целиком внутри рамки,
  // справа налево — все, которые рамка задела.
  private wallsInBox(x1: number, y1: number, x2: number, y2: number): string[] {
    const doc = this.getDoc()
    const f = doc && this.toolFloorId ? findFloor(doc, this.toolFloorId) : undefined
    if (!f) return []
    const { scene, engine, camera } = this.bundle
    const transform = scene.getTransformMatrix()
    // рамка в CSS-пикселях — и проекция узлов в CSS-пикселях (при пониженном разрешении они не совпадают с пикселями рендера)
    const canvas = engine.getRenderingCanvas()
    const viewport = camera.viewport.toGlobal(canvas?.clientWidth || engine.getRenderWidth(), canvas?.clientHeight || engine.getRenderHeight())
    const y = f.elevation * S
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), minY = Math.min(y1, y2), maxY = Math.max(y1, y2)
    const crossing = x2 < x1
    const inside = (p: { x: number; y: number }) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
    const screen = (n: { x: number; y: number }) => {
      const v = Vector3.Project(new Vector3(n.x * S, y, n.y * S), Matrix.Identity(), transform, viewport)
      return { x: v.x, y: v.y }
    }
    const out: string[] = []
    for (const id in f.wallGraph.edges) {
      const e = f.wallGraph.edges[id]
      const na = f.wallGraph.nodes[e.a]
      const nb = f.wallGraph.nodes[e.b]
      if (!na || !nb) continue
      const a = screen(na)
      const b = screen(nb)
      const hit = crossing ? inside(a) || inside(b) || segmentHitsRect(a, b, minX, minY, maxX, maxY) : inside(a) && inside(b)
      if (hit) out.push(id)
    }
    return out
  }

  private wallDelta(w: NonNullable<BuilderEngine["dragWall"]>, p: Vector3): { dx: number; dy: number; offset: number } {
    const d = wallPushDelta(w.a, w.b, w.startMm, { x: p.x * 1000, y: p.z * 1000 }, this.snapEnabled ? 50 : 10)
    return { dx: Math.round(d.dx), dy: Math.round(d.dy), offset: d.offset }
  }

  private nodeTarget(dn: NonNullable<BuilderEngine["dragNode"]>, p: Vector3): Vec2 {
    const t = nodeDragTarget(dn.orig, dn.startMm, { x: p.x * 1000, y: p.z * 1000 }, dn.neighbors, this.snapEnabled ? 100 : 10, this.snapEnabled ? 150 : 0)
    return { x: Math.round(t.x), y: Math.round(t.y) }
  }

  // Подпись этажа не рисуется, если между камерой и ней стоит геометрия другого
  // этажа: иначе размеры 1 этажа висели на крыше 2-го. Лучи — раз в 250 мс.
  private updateLabelOcclusion(): void {
    const { scene } = this.bundle
    const cam = scene.activeCamera
    this.occludedLabels.clear()
    if (!cam) return
    const ortho = cam.mode === Camera.ORTHOGRAPHIC_CAMERA
    const forward = cam.getDirection(Vector3.Forward())
    for (const a of this.labelAnchors) {
      let origin: Vector3
      let dir: Vector3
      let len: number
      if (ortho) {
        origin = a.world.subtract(forward.scale(400))
        dir = forward
        len = 400
      } else {
        origin = cam.globalPosition
        const d = a.world.subtract(origin)
        len = d.length()
        if (len < 0.01) continue
        dir = d.scale(1 / len)
      }
      const hit = scene.pickWithRay(new Ray(origin, dir, len - 0.4), (m) => {
        if (!m.isPickable || !m.isEnabled() || m.visibility < 0.5) return false
        const meta = m.metadata as MeshMeta | null
        // заслоняет геометрия других этажей, крыша и наружные стены своего этажа:
        // иначе площади «висели» поверх фасада при взгляде снаружи
        if (!meta?.floorId) return false
        if (meta.floorId !== a.floorId || meta.kind === "roof") return true
        return a.kind === "room" && meta.kind === "wall"
      })
      if (hit?.hit) this.occludedLabels.add(a.id)
    }
  }

  private labelsEmpty = false
  private projectLabels(): void {
    // в обходе подписи не нужны — они закрывают вид от первого лица
    const walking = !!this.walkCamera && this.bundle.scene.activeCamera === this.walkCamera
    if (this.labelAnchors.length === 0 || walking) {
      // этаж очистили — старые подписи должны исчезнуть, а не висеть в воздухе
      if (!this.labelsEmpty) {
        this.labelsEmpty = true
        this.onLabels([])
      }
      return
    }
    this.labelsEmpty = false
    const { scene, engine, camera } = this.bundle
    const w = engine.getRenderWidth()
    const h = engine.getRenderHeight()
    const transform = scene.getTransformMatrix()
    const viewport = camera.viewport.toGlobal(w, h)
    // Babylon рисует в пикселях устройства (adaptToDeviceRatio), подписи — в CSS-пикселях.
    // Без этого на экране с масштабом 110–150 % подписи уезжали от стен.
    const canvas = engine.getRenderingCanvas()
    const k = canvas && canvas.clientWidth > 0 ? canvas.clientWidth / w : 1
    const now = performance.now()
    if (now - this.lastOcclusionAt > 250) {
      this.lastOcclusionAt = now
      this.updateLabelOcclusion()
    }
    const out: ScreenLabel[] = []
    for (const a of this.labelAnchors) {
      if (this.occludedLabels.has(a.id)) continue
      const p = Vector3.Project(a.world, Matrix.Identity(), transform, viewport)
      if (p.z < 0 || p.z > 1) continue // за камерой
      if (p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 40) continue
      const x = p.x * k
      const y = p.y * k
      if (a.kind === "wall") out.push({ kind: "wall", id: a.id, x, y, lengthMm: a.lengthMm, angleDeg: a.angleDeg })
      else if (a.kind === "note") out.push({ kind: "note", id: a.id, x, y, text: a.text, dim: a.dim, angleDeg: a.angleDeg })
      else out.push({ kind: "room", id: a.id, floorId: a.floorId, x, y, areaMm2: a.areaMm2 })
    }
    this.onLabels(out)
  }

  private handleMove(): void {
    // координаты курсора на плоскости этажа — для статус-бара, не чаще 20 раз/с
    const nowC = performance.now()
    if (nowC - this.lastCursorAt > 50) {
      this.lastCursorAt = nowC
      const pc = this.projectToPlane()
      this.onCursor(pc ? { x: Math.round(pc.x * 1000), y: Math.round(pc.z * 1000) } : null)
    }
    if (this.terrainEditing) {
      this.terrainBrush()
      return
    }
    if (this.pathDragStart) {
      const now = performance.now()
      if (now - this.lastMoveAt < 33) return
      this.lastMoveAt = now
      const p = this.projectToY(0)
      if (!p) return
      const end: Vec2 = { x: snapToGrid(p.x * 1000, 100), y: snapToGrid(p.z * 1000, 100) }
      this.drawDragPreview(this.pathDragStart, end)
      this.onHud(this.tool === "pave" ? "Площадка: протяните прямоугольник и отпустите" : "Дорога: протяните линию и отпустите (одиночный клик — ввод по точкам)")
      return
    }
    if (this.roomStart) {
      this.updateRoomPreview()
      return
    }
    if (this.box) {
      const b = this.box
      const { scene } = this.bundle
      if (!b.moved) {
        if (!passedDragThreshold(b.sx, b.sy, scene.pointerX, scene.pointerY)) return
        b.moved = true
      }
      // pointerX уже в CSS-пикселях холста — масштаб рендера (лёгкий режим) не при чём
      this.onBox({ x1: b.sx, y1: b.sy, x2: scene.pointerX, y2: scene.pointerY })
      return
    }
    if (this.dragWall) {
      const w = this.dragWall
      if (!w.moved) {
        if (!passedDragThreshold(w.sx, w.sy, this.bundle.scene.pointerX, this.bundle.scene.pointerY)) return
        w.moved = true
        this.beginFloorDrag(w.floorId)
      }
      const p = this.projectToPlane()
      if (!p) return
      const d = this.wallDelta(w, p)
      const now = performance.now()
      if (now - this.lastMoveAt > 33) {
        this.lastMoveAt = now
        this.previewFloorDrag(w.floorId, new MoveWallCommand(w.floorId, w.edgeId, d.dx, d.dy))
        this.onHud(`Сдвиг стены ${(d.offset / 1000).toFixed(2)} м`)
      }
      return
    }
    if (this.dragOpening) {
      if (!this.dragOpening.moved) {
        if (!passedDragThreshold(this.dragOpening.sx, this.dragOpening.sy, this.bundle.scene.pointerX, this.bundle.scene.pointerY)) return
        this.dragOpening.moved = true
        this.beginFloorDrag(this.dragOpening.floorId)
      }
      const off = this.openingOffset(this.dragOpening.floorId, this.dragOpening.openingId)
      const now = performance.now()
      if (off != null && now - this.lastMoveAt > 33) {
        this.lastMoveAt = now
        this.previewFloorDrag(this.dragOpening.floorId, new MoveOpeningCommand(this.dragOpening.floorId, this.dragOpening.openingId, off))
      }
      return
    }
    if (this.dragStair) {
      if (!this.dragStair.moved) {
        if (!passedDragThreshold(this.dragStair.sx, this.dragStair.sy, this.bundle.scene.pointerX, this.bundle.scene.pointerY)) return
        this.dragStair.moved = true
        this.beginFloorDrag(this.dragStair.floorId)
      }
      const p = this.projectToPlane()
      if (!p) return
      const now = performance.now()
      if (now - this.lastMoveAt > 33) {
        this.lastMoveAt = now
        const to = this.stairDragTarget(this.dragStair.floorId, this.dragStair.stairId, p.x * 1000, p.z * 1000)
        this.previewFloorDrag(this.dragStair.floorId, new MoveStairCommand(this.dragStair.floorId, this.dragStair.stairId, to.x, to.y))
      }
      return
    }
    if (this.dragNode) {
      const dn = this.dragNode
      if (!dn.moved) {
        if (!passedDragThreshold(dn.sx, dn.sy, this.bundle.scene.pointerX, this.bundle.scene.pointerY)) return
        dn.moved = true
        this.beginFloorDrag(dn.floorId)
      }
      const p = this.projectToPlane()
      if (!p) return
      const target = this.nodeTarget(dn, p)
      const now = performance.now()
      if (now - this.lastMoveAt > 33) {
        this.lastMoveAt = now
        this.previewFloorDrag(dn.floorId, new MoveNodeCommand(dn.floorId, dn.nodeId, target))
        this.onHud(`Узел X ${(target.x / 1000).toFixed(2)} · Y ${(target.y / 1000).toFixed(2)} м`)
      }
      return
    }
    if (this.dragObject) {
      const p = this.projectToY(this.dragObject.planeY)
      if (!p) return
      const tk = "site" in this.dragObject.target ? "site" : this.dragObject.target.floorId
      const og = this.snapEnabled ? 50 : 1
      const snap = this.snapObjectXZ(tk, snapToGrid(p.x * 1000, og), snapToGrid(p.z * 1000, og), this.dragObject.objectId)
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
    if (this.tool === "annotate") {
      const p = this.projectToPlane()
      if (!p) return
      const r = this.resolveWallPoint(p)
      this.showSnapMarker(this.dimB ? null : r.world)
      if (this.dimA) this.updateDimPreview(r.mm)
      return
    }
    if (this.tool === "section") {
      const p = this.projectToPlane()
      if (p && this.sectionStart) {
        const end = this.sectionEnd({ x: p.x * 1000, y: p.z * 1000 })
        this.sectionPreview?.dispose()
        this.sectionPreview = this.drawSectionLine(this.docRoot, { id: "preview", name: "", a: this.sectionStart, b: end, look: 1 }, this.activeFloorPlaneY(), true)
        this.onHud(`Разрез: ${(Math.hypot(end.x - this.sectionStart.x, end.y - this.sectionStart.y) / 1000).toFixed(2)} м · стрелки — куда смотрим · клик — готово, Esc — отмена`)
      }
      return
    }
    if (this.tool === "mep-run") {
      const c = this.mepCursor()
      if (c && this.mepPoints.length) this.updateMepPreview(c.at, c.kind)
      this.showSnapMarker(c && c.kind === "target" ? new Vector3(c.at.x * S, this.activeFloorPlaneY() + 0.02, c.at.y * S) : null)
      return
    }
    if (this.tool === "mep-device") {
      const c = this.mepDevicePlacement()
      this.showSnapMarker(c ? new Vector3(c.at.x * S, this.activeFloorPlaneY() + 0.02, c.at.y * S) : null)
      return
    }
    if (this.tool === "wall" && this.wallStart && this.wallArc && this.arcEnd) {
      const p = this.projectToPlane()
      if (p) this.updateArcPreview(p)
      return
    }
    if (this.tool === "wall" && this.wallStart) {
      const p = this.projectToPlane()
      if (p) {
        const r = this.resolveWallPoint(p)
        this.updateWallPreview(r)
        this.showSnapMarker(r.world)
      }
      return
    }
    if (this.tool === "wall" || this.tool === "measure") {
      const p = this.projectToPlane()
      this.showSnapMarker(p ? this.resolveWallPoint(p).world : null)
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
    if (this.pathDragStart) {
      const start = this.pathDragStart
      this.pathDragStart = null
      this.dragPreview?.dispose()
      this.dragPreview = null
      if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
      const p = this.projectToY(0)
      if (p) {
        const end: Vec2 = { x: snapToGrid(p.x * 1000, 100), y: snapToGrid(p.z * 1000, 100) }
        const dist = Math.hypot(end.x - start.x, end.y - start.y)
        if (dist >= 700) {
          // Настоящее протягивание → строим объект.
          if (this.tool === "pave") {
            const pts: Vec2[] = [
              { x: start.x, y: start.y }, { x: end.x, y: start.y },
              { x: end.x, y: end.y }, { x: start.x, y: end.y },
            ]
            this.onCommand(new AddPavementCommand({ id: uid("pv"), points: pts, materialId: this.paveMaterial }))
          } else {
            const kind = this.tool === "fence" ? "fence" : this.pathKind === "path" ? "path" : "road"
            const style = kind === "fence" ? this.fenceStyle : "wood"
            this.onCommand(new AddPathCommand({ id: uid("p"), points: [{ x: start.x, y: start.y }, { x: end.x, y: end.y }], width: Math.max(300, this.pathWidth), kind, style }))
          }
          this.suppressTap = true // не дать последующему tap добавить точку
          this.onHud(null)
        }
      }
      return
    }
    if (this.roomStart) {
      const p = this.projectToPlane()
      if (p && this.toolFloorId) {
        const x1 = Math.round(this.roomStart.x * 1000)
        const y1 = Math.round(this.roomStart.z * 1000)
        const x2 = snapToGrid(p.x * 1000, 100)
        const y2 = snapToGrid(p.z * 1000, 100)
        if (Math.abs(x2 - x1) >= 500 && Math.abs(y2 - y1) >= 500) {
          this.onCommand(new AddRoomCommand(this.toolFloorId, x1, y1, x2, y2, this.wallDefaults({ thickness: 150, height: 3500, kind: "interior" })))
        }
      }
      this.roomStart = null
      this.roomPreview?.dispose()
      this.roomPreview = null
      if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
      return
    }
    if (this.box) {
      const b = this.box
      this.box = null
      if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
      if (b.moved) {
        this.onBox(null)
        this.lastDragEndAt = performance.now()
        const { scene } = this.bundle
        this.onBoxSelect(this.wallsInBox(b.sx, b.sy, scene.pointerX, scene.pointerY), b.additive)
      }
      return
    }
    if (this.dragWall) {
      const w = this.dragWall
      const p = this.projectToPlane()
      this.endFloorDrag()
      if (w.moved) {
        this.lastDragEndAt = performance.now()
        this.onHud(null)
        const d = p ? this.wallDelta(w, p) : null
        if (d && d.offset !== 0) this.onCommand(new MoveWallCommand(w.floorId, w.edgeId, d.dx, d.dy))
      }
      this.dragWall = null
      if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
      return
    }
    if (this.dragOpening) {
      const off = this.openingOffset(this.dragOpening.floorId, this.dragOpening.openingId)
      this.endFloorDrag()
      if (this.dragOpening.moved) this.lastDragEndAt = performance.now()
      if (off != null && this.dragOpening.moved) this.onCommand(new MoveOpeningCommand(this.dragOpening.floorId, this.dragOpening.openingId, off))
      this.dragOpening = null
      if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
      return
    }
    if (this.dragStair) {
      const p = this.projectToPlane()
      this.endFloorDrag()
      if (this.dragStair.moved) this.lastDragEndAt = performance.now()
      if (p && this.dragStair.moved) {
        const to = this.stairDragTarget(this.dragStair.floorId, this.dragStair.stairId, p.x * 1000, p.z * 1000)
        this.onCommand(new MoveStairCommand(this.dragStair.floorId, this.dragStair.stairId, to.x, to.y))
      }
      this.dragStair = null
      if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
      return
    }
    if (this.dragNode) {
      const dn = this.dragNode
      const p = this.projectToPlane()
      this.endFloorDrag()
      if (dn.moved) {
        this.lastDragEndAt = performance.now()
        this.onHud(null)
        if (p) {
          const target = this.nodeTarget(dn, p)
          if (target.x !== dn.orig.x || target.y !== dn.orig.y) this.onCommand(new MoveNodeCommand(dn.floorId, dn.nodeId, target))
        }
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
        const og = this.snapEnabled ? 50 : 1
        const snapped = this.snapObjectXZ(targetKey, snapToGrid(p.x * 1000, og), snapToGrid(p.z * 1000, og), drag.objectId)
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
    // После рисования протягиванием POINTERTAP не должен добавлять точку.
    if (this.suppressTap) { this.suppressTap = false; return }
    if (this.dragNode || this.dragObject) return
    // tap сразу после перетаскивания — хвост того же жеста, не новый клик
    if (performance.now() - this.lastDragEndAt < 250) return
    // Walk-режим: клик по двери открывает/закрывает её, без редактирования.
    if (this.walkCamera && this.bundle.scene.activeCamera === this.walkCamera) {
      this.handleWalkTap()
      return
    }
    if (this.tool === "object" && this.armedAsset) {
      this.handlePlaceObject()
      return
    }
    if (this.tool === "section") {
      this.handleSectionTap()
      return
    }
    if (this.tool === "annotate") {
      this.handleAnnotateTap()
      return
    }
    if (this.tool === "mep-run") {
      this.handleMepRunTap()
      return
    }
    if (this.tool === "mep-device") {
      this.handleMepDeviceTap()
      return
    }
    if (this.tool === "wall") {
      this.handleWallTap()
      return
    }
    if (this.tool === "measure") {
      this.handleMeasureTap()
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
      // клик по ручке не снимает выделение стены
      return
    }
    // Shift+клик по объекту или стене — добавить/убрать в мультивыбор.
    if (this.shiftDown && (meta?.kind === "object" || meta?.kind === "wall") && meta.entityId) {
      this.onMultiToggle(meta.entityId)
      return
    }
    this.onPick(meta && meta.entityId ? meta : null)
  }

  // ── Стена (цепочка) ────────────────────────────────────────────────────────
  isDrawingWall(): boolean {
    return this.tool === "wall" && this.wallStart !== null
  }

  /** Рулетка: две точки на плоскости этажа → длина. Ею же калибруется подложка. */
  private handleMeasureTap(): void {
    const p = this.projectToPlane()
    if (!p) return
    const r = this.resolveWallPoint(p)
    if (!this.measureStart) {
      this.measureStart = r.world
      this.showStartMarker(r.world)
      this.onHud("Вторая точка отрезка")
      return
    }
    const from: Vec2 = { x: this.measureStart.x * 1000, y: this.measureStart.z * 1000 }
    const to: Vec2 = r.mm
    const len = Math.hypot(to.x - from.x, to.y - from.y)
    this.measureStart = null
    this.preview?.dispose()
    this.onHud(`${(len / 1000).toFixed(2)} м`)
    this.onMeasure(len, from, to)
  }

  private handleWallTap(): void {
    if (!this.toolFloorId) return
    const p = this.projectToPlane()
    if (!p) return
    const r = this.resolveWallPoint(p)
    if (!this.wallStart) {
      this.wallStart = r.world
      this.showStartMarker(r.world)
      return
    }
    if (this.wallArc) {
      if (!this.arcEnd) {
        this.arcEnd = r.mm
        this.preview?.dispose()
        this.preview = null
        this.onHud("Точка на дуге — задаёт радиус")
        return
      }
      this.commitArc(p)
      return
    }
    this.commitWall(r.mm)
  }

  /** Дуга: начало → конец → точка на дуге (без привязки — радиус свободный). */
  private commitArc(through: Vector3): void {
    if (!this.wallStart || !this.arcEnd || !this.toolFloorId) return
    const a = { x: this.wallStart.x * 1000, y: this.wallStart.z * 1000 }
    const pts = arcPoints(a, this.arcEnd, { x: through.x * 1000, y: through.z * 1000 })
    const cmds = []
    for (let i = 0; i < pts.length - 1; i++) cmds.push(new InsertWallCommand(this.toolFloorId, pts[i], pts[i + 1], this.wallDefaults()))
    this.onCommand(new CompositeCommand("дуговая стена", cmds))
    this.cancelWallTool()
  }

  private updateArcPreview(through: Vector3): void {
    this.arcPreview?.dispose()
    this.arcPreview = null
    if (!this.wallStart || !this.arcEnd) return
    const a = { x: this.wallStart.x * 1000, y: this.wallStart.z * 1000 }
    const pts = arcPoints(a, this.arcEnd, { x: through.x * 1000, y: through.z * 1000 })
    const y = this.activeFloorPlaneY() + 0.05
    const line = MeshBuilder.CreateLines("arcPreview", { points: pts.map((p) => new Vector3(p.x * S, y, p.y * S)) }, this.bundle.scene)
    line.color = Color3.FromHexString("#38BDF8")
    line.isPickable = false
    this.arcPreview = line as unknown as Mesh
    const r = Math.hypot(this.arcEnd.x - a.x, this.arcEnd.y - a.y)
    this.onHud(`Дуга: хорда ${(r / 1000).toFixed(2)} м, участков ${pts.length - 1}`)
  }

  private commitWall(end: Vec2): void {
    if (!this.wallStart) return
    // без округления: начало, привязанное к дробному углу из данных, должно
    // совпасть с ним, а не лечь в полмиллиметре рядом
    const fromX = this.wallStart.x * 1000
    const fromY = this.wallStart.z * 1000
    if (Math.hypot(end.x - fromX, end.y - fromY) >= 100) {
      this.onCommand(new InsertWallCommand(this.toolFloorId, { x: fromX, y: fromY }, end, this.wallDefaults()))
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
    // и запятая, и точка: 36,55 и 36.55 — одна длина
    else if (/^[0-9]$/.test(key)) this.lengthInput += key
    else if ((key === "," || key === ".") && !/[.,]/.test(this.lengthInput)) this.lengthInput += ","

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

  // Маркер привязки: квадрат — узел, ромб — точка на стене. Виден и до первого
  // клика, чтобы было ясно, куда встанет начало стены.
  private snapMarker: Mesh | null = null
  private snapMarkerKind: "node" | "edge" | null = null
  private showSnapMarker(world: Vector3 | null): void {
    const kind = world ? this.snapKind : null
    if (!kind) {
      this.snapMarker?.setEnabled(false)
      return
    }
    if (!this.snapMarker || this.snapMarkerKind !== kind) {
      this.snapMarker?.dispose()
      const m = MeshBuilder.CreateBox("snapMarker", { width: 0.32, height: 0.05, depth: 0.32 }, this.bundle.scene)
      m.rotation.y = kind === "edge" ? Math.PI / 4 : 0
      m.material = this.reg.status(kind === "node" ? "#22c55e" : "#f59e0b")
      m.isPickable = false
      m.renderingGroupId = 1
      this.snapMarker = m
      this.snapMarkerKind = kind
    }
    this.snapMarker.setEnabled(true)
    this.snapMarker.position.copyFrom(world as Vector3)
  }

  private showStartMarker(world: Vector3): void {
    this.startMarker?.dispose()
    const m = MeshBuilder.CreateSphere("wallStart", { diameter: 0.35 }, this.bundle.scene)
    m.position.copyFrom(world)
    m.isPickable = false
    m.material = this.reg.status("#38BDF8")
    this.startMarker = m
  }

  /** Esc во время перетаскивания: вернуть как было, команду не слать. */
  cancelDrag(): boolean {
    const active = (this.dragWall?.moved || this.dragNode?.moved || this.dragOpening?.moved || this.dragStair?.moved) ?? false
    if (!this.dragWall && !this.dragNode && !this.dragOpening && !this.dragStair) return false
    this.endFloorDrag()
    this.dragWall = null
    this.dragNode = null
    this.dragOpening = null
    this.dragStair = null
    this.lastDragEndAt = performance.now()
    this.onHud(null)
    const canvas = this.bundle.engine.getRenderingCanvas()
    if (canvas) this.bundle.scene.activeCamera?.attachControl(canvas, true)
    return active
  }

  cancelWallTool(): void {
    this.snapMarker?.setEnabled(false)
    this.arcEnd = null
    this.arcPreview?.dispose()
    this.arcPreview = null
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
    // витраж занимает стену целиком, «на все этажи» — лентой снизу доверху
    if (isCurtain(spec.variant)) {
      const building = doc?.buildings.find((bd) => bd.floors.some((fl) => fl.id === f.id))
      const cmds: Command[] = []
      const add = (floorId: string, wid: string, len2: number, h: number) => {
        const cur = curtainSize(len2, h)
        cmds.push(
          new AddOpeningCommand(floorId, {
            id: uid("op"),
            wallId: wid,
            type: "window",
            variant: "curtain",
            width: cur.width,
            height: cur.height,
            sillHeight: cur.sill,
            offset: cur.offset,
            ...(this.replanMode ? { phase: "new" as const } : {}),
          }),
        )
      }
      add(meta.floorId, meta.entityId, len, e.height)
      if (spec.variant === "curtain-all") {
        for (const fl of building?.floors ?? []) {
          if (fl.id === f.id) continue
          const twin = sameWallOnFloor(fl.wallGraph, { x: a.x, y: a.y }, { x: b.x, y: b.y })
          if (!twin) continue
          const te = fl.wallGraph.edges[twin]
          const ta = fl.wallGraph.nodes[te.a], tb = fl.wallGraph.nodes[te.b]
          add(fl.id, twin, distance({ x: ta.x, y: ta.y }, { x: tb.x, y: tb.y }), te.height)
        }
      }
      this.onCommand(cmds.length === 1 ? cmds[0] : new CompositeCommand("витраж", cmds))
      return
    }
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
        ...(this.replanMode ? { phase: "new" as const } : {}),
      }),
    )
  }

  // ── Лестница ──────────────────────────────────────────────────────────────────
  private handleStairTap(): void {
    const doc = this.getDoc()
    const f = doc ? findFloor(doc, this.toolFloorId) : undefined
    if (!f || !doc) return
    const building = doc.buildings.find((bd) => bd.floors.some((fl) => fl.id === f.id))
    if (this.stairShape === "porch") {
      this.placePorch(f)
      return
    }
    if (this.stairShape === "column") {
      const pc = this.projectToPlane()
      if (!pc) return
      // в одну линию с другими колоннами этажа (допуск 300 мм)
      const at = snapColumn(f, { x: pc.x * 1000, y: pc.z * 1000 }, 300, undefined, this.snapEnabled ? 50 : 0).p
      this.onCommand(new AddStairCommand(f.id, { id: uid("st"), shape: "column", fromFloorId: f.id, toFloorId: f.id, position: at, rotationDeg: 0, width: 500, depth: 500, railing: false }))
      return
    }
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
    const shape = this.stairShape as "straight" | "l" | "u" | "spiral" | "elevator"
    const toFloorId = upper?.id ?? f.id
    // лифтовая шахта 2000×2200 (кабина на 8 человек), марш — 1100
    const width = shape === "elevator" ? 2000 : 1100
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
      new AddStairCommand(f.id, { id: uid("st"), shape, fromFloorId: f.id, toFloorId, position: pos, rotationDeg: 0, width, railing: shape !== "elevator" }),
    )
  }

  // ── Пометки: размеры и надписи ──────────────────────────────────────────────
  // Размер: точка, точка (привязка к узлам и стенам), третий клик — вынос линии.
  // Надпись: клик ставит текст «Надпись», править — в свойствах.
  private handleAnnotateTap(): void {
    const p = this.projectToPlane()
    if (!p || !this.toolFloorId) return
    const r = this.resolveWallPoint(p)
    if (this.annotateKind === "text") {
      const id = uid("an")
      this.onCommand(new AddAnnotationCommand(this.toolFloorId, { id, kind: "text", at: { x: Math.round(r.mm.x), y: Math.round(r.mm.y) }, text: "Надпись" }))
      this.onPick({ kind: "annotation", floorId: this.toolFloorId, entityId: id })
      this.onHud("Надпись поставлена — текст меняется в свойствах справа")
      return
    }
    if (!this.dimA) {
      this.dimA = { x: Math.round(r.mm.x), y: Math.round(r.mm.y) }
      this.onHud("Размер: вторая точка")
      return
    }
    if (!this.dimB) {
      const b = { x: Math.round(r.mm.x), y: Math.round(r.mm.y) }
      if (Math.hypot(b.x - this.dimA.x, b.y - this.dimA.y) < 10) return
      this.dimB = b
      this.onHud("Размер: отведите размерную линию и кликните")
      return
    }
    const offset = Math.round(signedOffset(this.dimA, this.dimB, { x: p.x * 1000, y: p.z * 1000 }))
    this.onCommand(new AddAnnotationCommand(this.toolFloorId, { id: uid("an"), kind: "dim", a: this.dimA, b: this.dimB, offset: Math.abs(offset) < 50 ? 600 : offset }))
    this.cancelAnnotate()
  }

  isDrawingAnnotation(): boolean {
    return this.tool === "annotate" && this.dimA !== null
  }

  cancelAnnotate(): void {
    const had = this.dimA !== null
    this.dimA = null
    this.dimB = null
    this.dimPreview?.dispose()
    this.dimPreview = null
    if (had) this.onHud(null)
  }

  private dimLines(a: Vec2, b: Vec2, offset: number): Vector3[][] {
    const g = dimGeometry(a, b, offset)
    const y = this.activeFloorPlaneY() + 0.1
    const V = (q: Vec2) => new Vector3(q.x * S, y, q.y * S)
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
    const t = 120 // засечка 45°, мм
    const tick = (q: Vec2) => [V({ x: q.x - (u.x + g.n.x) * t, y: q.y - (u.y + g.n.y) * t }), V({ x: q.x + (u.x + g.n.x) * t, y: q.y + (u.y + g.n.y) * t })]
    return [[V(g.p1), V(g.p2)], ...g.ext.map(([p, q]) => [V(p), V(q)]), tick(g.p1), tick(g.p2)]
  }

  private updateDimPreview(cursor: Vec2): void {
    if (!this.dimA) return
    this.dimPreview?.dispose()
    const b = this.dimB ?? cursor
    const offset = this.dimB ? signedOffset(this.dimA, this.dimB, cursor) : 600
    const root = new TransformNode("dimPreview", this.bundle.scene)
    const sys = MeshBuilder.CreateLineSystem("dimPreviewLines", { lines: this.dimLines(this.dimA, b, offset) }, this.bundle.scene)
    sys.color = Color3.FromHexString("#0ea5e9")
    sys.isPickable = false
    sys.renderingGroupId = 1
    sys.parent = root
    this.dimPreview = root
    this.onHud(`Размер ${Math.round(Math.hypot(b.x - this.dimA.x, b.y - this.dimA.y))} мм${this.dimB ? " · клик — поставить" : ""}`)
  }

  private drawAnnotations(f: Floor, parent: TransformNode): void {
    const lines: Vector3[][] = []
    for (const an of f.annotations ?? []) {
      if (an.kind === "dim") lines.push(...this.dimLines(an.a, an.b, an.offset).map((seg) => seg.map((v) => new Vector3(v.x, (f.elevation * S) + 0.1, v.z))))
    }
    if (!lines.length) return
    const sys = MeshBuilder.CreateLineSystem(`dims_${f.id}`, { lines }, this.bundle.scene)
    sys.color = Color3.FromHexString("#0284c7")
    sys.isPickable = false
    sys.renderingGroupId = 1
    sys.parent = parent
    sys.position.y = -f.elevation * S // линии уже в мировой высоте этажа, а родитель поднят на отметку
  }

  private nearestAnnotationAtPointer(tolPx: number): MeshMeta | null {
    const doc = this.getDoc()
    const f = doc && this.toolFloorId ? findFloor(doc, this.toolFloorId) : undefined
    if (!f?.annotations?.length) return null
    const { scene } = this.bundle
    const p = this.planeAtScreen(scene.pointerX, scene.pointerY)
    if (!p) return null
    const pm = { x: p.x * 1000, y: p.z * 1000 }
    const tol = this.mepTolMm(tolPx)
    let best: { meta: MeshMeta; d: number } | null = null
    for (const an of f.annotations) {
      let d: number
      if (an.kind === "dim") {
        const g = dimGeometry(an.a, an.b, an.offset)
        d = closestOnSegment(pm, g.p1, g.p2).dist
      } else d = Math.max(0, Math.hypot(an.at.x - pm.x, an.at.y - pm.y) - 300)
      if (d <= tol && (!best || d < best.d)) best = { meta: { kind: "annotation", floorId: f.id, entityId: an.id }, d }
    }
    return best?.meta ?? null
  }

  // ── Разрезы ─────────────────────────────────────────────────────────────────
  // Два клика — секущая линия. С привязкой (G) линия держится горизонтально или
  // вертикально в пределах 10°. Смотрим влево от направления рисования; сторону
  // меняют в свойствах разреза.
  private sectionEnd(raw: Vec2): Vec2 {
    const a = this.sectionStart
    if (!a) return raw
    let b = { x: Math.round(raw.x), y: Math.round(raw.y) }
    if (this.snapEnabled) {
      const dx = b.x - a.x, dy = b.y - a.y
      const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI)
      if (ang < 10 || ang > 170) b = { x: snapToGrid(b.x, 100), y: a.y }
      else if (Math.abs(ang - 90) < 10) b = { x: a.x, y: snapToGrid(b.y, 100) }
    }
    return b
  }

  private handleSectionTap(): void {
    const p = this.projectToPlane()
    const doc = this.getDoc()
    if (!p || !doc) return
    const raw = { x: p.x * 1000, y: p.z * 1000 }
    if (!this.sectionStart) {
      this.sectionStart = this.snapEnabled ? { x: snapToGrid(raw.x, 100), y: snapToGrid(raw.y, 100) } : { x: Math.round(raw.x), y: Math.round(raw.y) }
      this.showStartMarker(new Vector3(this.sectionStart.x * S, this.activeFloorPlaneY() + 0.02, this.sectionStart.y * S))
      this.onHud("Разрез: вторая точка линии")
      return
    }
    const a = this.sectionStart
    const b = this.sectionEnd(raw)
    if (Math.hypot(b.x - a.x, b.y - a.y) < 500) return
    const building = doc.buildings.find((bd) => bd.floors.some((f) => f.id === this.toolFloorId)) ?? doc.buildings[0]
    if (!building) return
    const name = nextSectionName(doc, building.id)
    this.onCommand(new AddSectionCommand(building.id, { id: uid("sec"), name, a, b, look: 1 }))
    this.cancelSection()
    this.onHud(`Разрез ${name} добавлен — лист разреза: «Чертёж этажа» → вид «Разрез ${name}»`)
  }

  isDrawingSection(): boolean {
    return this.tool === "section" && this.sectionStart !== null
  }

  cancelSection(): void {
    this.sectionStart = null
    this.sectionPreview?.dispose()
    this.sectionPreview = null
    this.preview?.dispose()
    this.preview = null
    this.startMarker?.dispose()
    this.startMarker = null
  }

  /** Линия разреза: штрихпунктир, утолщённые концы и стрелки направления взгляда. */
  private drawSectionLine(parent: TransformNode | null, sec: { id: string; name: string; a: Vec2; b: Vec2; look: 1 | -1 }, planeY: number, preview: boolean): TransformNode {
    const scene = this.bundle.scene
    const root = new TransformNode(`section_${sec.id}`, scene)
    if (parent) root.parent = parent
    const y = planeY + 0.09
    const color = Color3.FromHexString("#DC2626")
    const L = Math.hypot(sec.b.x - sec.a.x, sec.b.y - sec.a.y)
    if (L < 1) return root
    const t = { x: (sec.b.x - sec.a.x) / L, y: (sec.b.y - sec.a.y) / L }
    const d = { x: -t.y * sec.look, y: t.x * sec.look }
    const V = (p: Vec2) => new Vector3(p.x * S, y, p.y * S)
    const dashed = MeshBuilder.CreateDashedLines(`secline_${sec.id}`, { points: [V(sec.a), V(sec.b)], dashSize: 3, gapSize: 1, dashNb: Math.max(8, Math.round(L / 600)) }, scene)
    dashed.color = color
    dashed.isPickable = false
    dashed.renderingGroupId = 1
    dashed.parent = root
    const lines: Vector3[][] = []
    const arrow = 900, head = 250
    for (const end of [sec.a, sec.b]) {
      const tip = { x: end.x + d.x * arrow, y: end.y + d.y * arrow }
      lines.push([V(end), V(tip)])
      lines.push([V(tip), V({ x: tip.x - d.x * head + t.x * head * 0.6, y: tip.y - d.y * head + t.y * head * 0.6 })])
      lines.push([V(tip), V({ x: tip.x - d.x * head - t.x * head * 0.6, y: tip.y - d.y * head - t.y * head * 0.6 })])
    }
    const sys = MeshBuilder.CreateLineSystem(`secarrows_${sec.id}`, { lines }, scene)
    sys.color = color
    sys.isPickable = false
    sys.renderingGroupId = 1
    sys.parent = root
    // утолщённые концы: короткие плоские полосы — линии в WebGL всегда в 1 px
    for (const [i, end] of [sec.a, sec.b].entries()) {
      const into = i === 0 ? t : { x: -t.x, y: -t.y }
      const len = Math.min(1200, L / 3)
      const bar = MeshBuilder.CreateBox(`secend_${sec.id}_${i}`, { width: len * S, height: 0.02, depth: 0.12 }, scene)
      bar.position.set((end.x + into.x * len / 2) * S, y, (end.y + into.y * len / 2) * S)
      bar.rotation.y = -Math.atan2(into.y, into.x)
      bar.material = this.reg.flat("#DC2626")
      bar.isPickable = false
      bar.renderingGroupId = 1
      bar.parent = root
    }
    if (!preview && sec.name) root.metadata = { kind: "section", entityId: sec.id }
    return root
  }

  private nearestSectionAtPointer(tolPx: number): MeshMeta | null {
    const doc = this.getDoc()
    if (!doc) return null
    const { scene } = this.bundle
    const p = this.planeAtScreen(scene.pointerX, scene.pointerY)
    if (!p) return null
    const pm = { x: p.x * 1000, y: p.z * 1000 }
    const tol = this.mepTolMm(tolPx)
    let best: { meta: MeshMeta; d: number } | null = null
    for (const b of doc.buildings) for (const sec of b.sections ?? []) {
      const { dist } = closestOnSegment(pm, sec.a, sec.b)
      if (dist <= tol && (!best || dist < best.d)) best = { meta: { kind: "section", entityId: sec.id, target: b.id }, d: dist }
    }
    return best?.meta ?? null
  }

  // ── Инженерные сети ─────────────────────────────────────────────────────────
  // Трасса: клики ставят точки (привязка к приборам и вершинам своей системы,
  // угол 45°), клик в последней точке или Enter — готово, Esc — отмена.
  // Прибор: клик ставит; настенные прижимаются к ближайшей стене лицом в комнату.
  private mepTolMm(px = 12): number {
    const { scene } = this.bundle
    const p = this.planeAtScreen(scene.pointerX, scene.pointerY)
    const q = this.planeAtScreen(scene.pointerX + px, scene.pointerY)
    return p && q ? Math.max(20, Math.hypot(q.x - p.x, q.z - p.z) * 1000) : 150
  }

  private mepCursor(): { at: Vec2; kind: string; raw: Vec2 } | null {
    const doc = this.getDoc()
    const f = doc ? findFloor(doc, this.toolFloorId) : undefined
    const p = this.projectToPlane()
    if (!f || !p) return null
    const raw = { x: p.x * 1000, y: p.z * 1000 }
    const targets: Vec2[] = []
    for (const d of f.mepDevices ?? []) if (d.system === this.mepSystem) targets.push(d.at)
    for (const r of f.mepRuns ?? []) if (r.system === this.mepSystem) targets.push(...r.points)
    targets.push(...this.mepPoints.slice(0, -1))
    const prev = this.mepPoints[this.mepPoints.length - 1] ?? null
    const res = snapMepPoint(raw, prev, { targets, tolMm: this.mepTolMm(), snap: this.snapEnabled })
    return { ...res, raw }
  }

  private mepDevicePlacement(): { at: Vec2; rotation: number } | null {
    const doc = this.getDoc()
    const f = doc ? findFloor(doc, this.toolFloorId) : undefined
    const p = this.projectToPlane()
    const info = MEP_DEVICE_BY_KIND[this.mepDeviceKind]
    if (!f || !p || !info) return null
    const raw = { x: p.x * 1000, y: p.z * 1000 }
    if (info.wall) {
      const m = wallMount(raw, f.wallGraph, info.box.d)
      if (m) return m
    }
    if (info.riser || info.kind === "drain") {
      // стояк и трап цепляются к вершинам трасс своей системы
      let best: { p: Vec2; d: number } | null = null
      const tol = this.mepTolMm()
      for (const r of f.mepRuns ?? []) if (r.system === info.system) for (const q of r.points) {
        const d = Math.hypot(q.x - raw.x, q.y - raw.y)
        if (d <= tol && (!best || d < best.d)) best = { p: q, d }
      }
      if (best) return { at: { ...best.p }, rotation: 0 }
    }
    const at = this.snapEnabled ? { x: snapToGrid(raw.x, 50), y: snapToGrid(raw.y, 50) } : { x: Math.round(raw.x), y: Math.round(raw.y) }
    return { at, rotation: 0 }
  }

  private handleMepRunTap(): void {
    const c = this.mepCursor()
    if (!c) return
    const last = this.mepPoints[this.mepPoints.length - 1]
    if (last && Math.hypot(c.raw.x - last.x, c.raw.y - last.y) <= this.mepTolMm()) {
      if (this.mepPoints.length >= 2) this.finalizeMep()
      return
    }
    this.mepPoints.push(c.at)
    this.updateMepPreview(c.at, c.kind)
  }

  private handleMepDeviceTap(): void {
    const doc = this.getDoc()
    const f = doc ? findFloor(doc, this.toolFloorId) : undefined
    const info = MEP_DEVICE_BY_KIND[this.mepDeviceKind]
    const place = this.mepDevicePlacement()
    if (!f || !info || !place) return
    if (info.wall && !wallMount(place.at, f.wallGraph, info.box.d, 50)) {
      this.onHud(`${info.name} ставится на стену — кликните ближе к стене`)
    }
    const same = (f.mepDevices ?? []).filter((d) => d.kind === info.kind).length
    const label = info.riser ? `Ст ${MEP_SYSTEM_INFO[info.system].mark}-${same + 1}` : info.kind === "panel" ? `ЩР-${same + 1}` : ""
    const height = deviceHeight(info, f.height)
    this.onCommand(new AddMepDeviceCommand(f.id, { id: uid("md"), system: info.system, kind: info.kind, at: place.at, height, rotation: place.rotation, label, power: info.power }))
    this.onHud(`${info.name}${label ? ` ${label}` : ""} · ${info.riser ? "во всю высоту этажа" : `${(height / 1000).toFixed(2)} м от пола`}`)
  }

  private updateMepPreview(cursor: Vec2, kind: string): void {
    this.mepPreview?.dispose()
    const info = MEP_SYSTEM_INFO[this.mepSystem]
    const doc = this.getDoc()
    const f = doc ? findFloor(doc, this.toolFloorId) : undefined
    const h = Math.min(info.runHeight, (f?.height ?? 3000) - 100)
    const y = this.activeFloorPlaneY() + h * S
    const root = new TransformNode("mepPreview", this.bundle.scene)
    const pts = [...this.mepPoints, cursor]
    const line = MeshBuilder.CreateLines("mepPreviewLine", { points: pts.map((p) => new Vector3(p.x * S, y, p.y * S)) }, this.bundle.scene)
    line.color = Color3.FromHexString(info.color)
    line.isPickable = false
    line.renderingGroupId = 1
    line.parent = root
    // проекция на пол — видно, где трасса в плане при взгляде в 3D
    const floorLine = MeshBuilder.CreateLines("mepPreviewFloor", { points: pts.map((p) => new Vector3(p.x * S, this.activeFloorPlaneY() + 0.03, p.y * S)) }, this.bundle.scene)
    floorLine.color = Color3.FromHexString(info.color).scale(0.6)
    floorLine.isPickable = false
    floorLine.parent = root
    this.mepPreview = root
    const total = polylineLengthMm(pts) / 1000
    const seg = this.mepPoints.length ? Math.hypot(cursor.x - this.mepPoints[this.mepPoints.length - 1].x, cursor.y - this.mepPoints[this.mepPoints.length - 1].y) / 1000 : 0
    const hint = kind === "target" ? " · привязка к прибору" : ""
    this.onHud(`${info.name} ${info.mark}: участок ${seg.toFixed(2)} м, всего ${total.toFixed(2)} м${hint} · клик в последней точке или Enter — готово, Esc — отмена`)
  }

  isDrawingMep(): boolean {
    return this.tool === "mep-run" && this.mepPoints.length > 0
  }

  finalizeMep(): void {
    const doc = this.getDoc()
    const f = doc ? findFloor(doc, this.toolFloorId) : undefined
    if (!f || this.mepPoints.length < 2) {
      this.cancelMep()
      return
    }
    const info = MEP_SYSTEM_INFO[this.mepSystem]
    const points = this.mepPoints.map((p) => ({ ...p }))
    const height = Math.min(info.runHeight, f.height - 100)
    this.onCommand(new AddMepRunCommand(f.id, { id: uid("mr"), system: this.mepSystem, points, height, size: info.size, label: "" }))
    this.cancelMep()
    this.onHud(null)
  }

  cancelMep(): void {
    const had = this.mepPoints.length > 0
    this.mepPoints = []
    this.mepPreview?.dispose()
    this.mepPreview = null
    if (had) this.onHud(null)
  }

  private nearestMepAtPointer(tolPx: number): MeshMeta | null {
    const doc = this.getDoc()
    const f = doc && this.toolFloorId ? findFloor(doc, this.toolFloorId) : undefined
    if (!f) return null
    const layers = new Set(this.lastCtx?.mepLayers ?? MEP_SYSTEMS)
    const { scene } = this.bundle
    const p = this.planeAtScreen(scene.pointerX, scene.pointerY)
    if (!p) return null
    const pm = { x: p.x * 1000, y: p.z * 1000 }
    const tol = this.mepTolMm(tolPx)
    let best: { meta: MeshMeta; d: number } | null = null
    for (const dev of f.mepDevices ?? []) {
      if (!layers.has(dev.system)) continue
      const info = MEP_DEVICE_BY_KIND[dev.kind]
      const r = Math.max(60, (info?.box.w ?? 200) / 2)
      const d = Math.max(0, Math.hypot(dev.at.x - pm.x, dev.at.y - pm.y) - r)
      if (d <= tol && (!best || d < best.d)) best = { meta: { kind: "mep-device", floorId: f.id, entityId: dev.id }, d: d - 1 }
    }
    for (const run of f.mepRuns ?? []) {
      if (!layers.has(run.system)) continue
      for (let i = 1; i < run.points.length; i++) {
        const { dist } = closestOnSegment(pm, run.points[i - 1], run.points[i])
        if (dist <= tol && (!best || dist < best.d)) best = { meta: { kind: "mep-run", floorId: f.id, entityId: run.id }, d: dist }
      }
    }
    return best?.meta ?? null
  }

  /** Крыльцо прижимается площадкой к ближайшей стене снаружи, ступени — от здания. */
  /** Цель перетаскивания лестницы: колонна — в линию с другими колоннами, остальное — сетка 100 мм. */
  private stairDragTarget(floorId: string, stairId: string, x: number, y: number): { x: number; y: number } {
    const doc = this.getDoc()
    const f = doc ? findFloor(doc, floorId) : undefined
    if (f && f.stairs.find((s) => s.id === stairId)?.shape === "column") return snapColumn(f, { x, y }, 300, stairId, 50).p
    return { x: snapToGrid(x, 100), y: snapToGrid(y, 100) }
  }

  private placePorch(f: Floor): void {
    const p = this.projectToPlane()
    if (!p) return
    const click: Vec2 = { x: p.x * 1000, y: p.z * 1000 }
    let best: { d: number; proj: Vec2; nx: number; ny: number; th: number } | null = null
    for (const e of Object.values(f.wallGraph.edges)) {
      const a = f.wallGraph.nodes[e.a], b = f.wallGraph.nodes[e.b]
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const L2 = dx * dx + dy * dy
      if (L2 < 1) continue
      const t = Math.max(0, Math.min(1, ((click.x - a.x) * dx + (click.y - a.y) * dy) / L2))
      const proj = { x: a.x + dx * t, y: a.y + dy * t }
      const d = Math.hypot(click.x - proj.x, click.y - proj.y)
      if (best && d >= best.d) continue
      const L = Math.sqrt(L2)
      let nx = -dy / L, ny = dx / L
      if ((click.x - proj.x) * nx + (click.y - proj.y) * ny < 0) { nx = -nx; ny = -ny }
      best = { d, proj, nx, ny, th: e.thickness }
    }
    const rise = f.elevation >= 150 && f.elevation <= 2000 ? Math.round(f.elevation) : 450
    const width = 1800
    let position: Vec2 = { x: Math.round(click.x), y: Math.round(click.y) }
    let rotationDeg = 0
    if (best && best.d < 4000) {
      position = { x: Math.round(best.proj.x + (best.nx * best.th) / 2), y: Math.round(best.proj.y + (best.ny * best.th) / 2) }
      rotationDeg = Math.round((Math.atan2(best.nx, best.ny) * 180) / Math.PI)
    }
    this.onCommand(new AddStairCommand(f.id, { id: uid("st"), shape: "porch", fromFloorId: f.id, toFloorId: f.id, position, rotationDeg, width, railing: false, rise }))
    this.onHud(
      f.elevation < 150
        ? "Крыльцо поставлено. Пол этажа на отметке 0 — ступени ниже земли не видны: поднимите «Отметку пола» до +0,45"
        : `Крыльцо: подъём ${(rise / 1000).toFixed(2)} м, ${Math.max(1, Math.round(rise / 170))} ступ.`,
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
    const doc = this.getDoc()
    if (meta.kind === "wall" && meta.floorId) {
      const cmd = doc ? replanDeleteWall(doc, meta.floorId, meta.entityId, this.replanMode) : null
      if (cmd) this.onCommand(cmd)
      else if (this.replanMode) this.onHud("Стена уже под демонтаж. Вернуть — в свойствах стены")
    } else if (meta.kind === "opening" && meta.floorId) {
      const cmd = doc ? replanDeleteOpening(doc, meta.floorId, meta.entityId, this.replanMode) : null
      if (cmd) this.onCommand(cmd)
    }
    else if (meta.kind === "stair" && meta.floorId) this.onCommand(new DeleteStairCommand(meta.floorId, meta.entityId))
    else if (meta.kind === "section" && meta.target) this.onCommand(new DeleteSectionCommand(meta.target, meta.entityId))
    else if (meta.kind === "annotation" && meta.floorId) this.onCommand(new DeleteAnnotationCommand(meta.floorId, meta.entityId))
    else if (meta.kind === "mep-run" && meta.floorId) this.onCommand(new DeleteMepRunCommand(meta.floorId, meta.entityId))
    else if (meta.kind === "mep-device" && meta.floorId) this.onCommand(new DeleteMepDeviceCommand(meta.floorId, meta.entityId))
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
  // прямоугольники котлованов под цоколем/подвалом (мировые метры) — для раскраски
  private pits: Array<{ x0: number; x1: number; z0: number; z1: number }> = []
  private excavateBasements(doc: BuilderDocument): void {
    this.pits = []
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
      this.pits.push({ x0: wx0, x1: wx1, z0: wz0, z1: wz1 })
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
    const CONCRETE: [number, number, number] = [0.58, 0.58, 0.56]
    for (let i = 0; i < vCount; i++) {
      const y = positions[i * 3 + 1]
      const x = positions[i * 3]
      const z = positions[i * 3 + 2]
      let c = GRASS
      // котлован под цоколем — бетон, а не песок водоёма (песок давал жёлтую кайму вокруг здания)
      if (this.pits.some((p) => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1)) c = CONCRETE
      else if (y < -0.1) c = SAND
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

  // Превью рисования протягиванием: дорога/забор — отрезок, площадка — контур
  // прямоугольника. Цвет — как у соответствующего точечного превью.
  private drawDragPreview(a: Vec2, b: Vec2): void {
    this.dragPreview?.dispose()
    const color = this.tool === "pave" ? "#38BDF8" : "#A78BFA"
    const y = this.tool === "pave" ? 0.11 : 0.08
    const root = new TransformNode("dragPreview", this.bundle.scene)
    const corners: Vec2[] = this.tool === "pave"
      ? [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }, { x: a.x, y: a.y }]
      : [a, b]
    const line = corners.map((p) => new Vector3(p.x * S, y, p.y * S))
    const poly = MeshBuilder.CreateLines("dragline", { points: line }, this.bundle.scene)
    poly.color = Color3.FromHexString(color)
    poly.isPickable = false
    poly.parent = root
    this.dragPreview = root
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
  /** Габарит ассета (Ш×Г×В, мм) при scale=1 — нужен и для плана, и для запрета наложения. */
  baseSize(assetId: string): { w: number; d: number; h: number } {
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
    // мебель и деревья кладём туда, где стоит уровень: на участке — на участок
    const onFloor = doc ? findFloor(doc, this.activeFloorId) : undefined
    const target = onFloor ? ({ floorId: this.activeFloorId } as const) : ({ site: true } as const)
    const targetKey = onFloor ? this.activeFloorId : "site"
    const og = this.snapEnabled ? 50 : 1
    const aligned = this.snapObjectXZ(targetKey, snapToGrid(p.x * 1000, og), snapToGrid(p.z * 1000, og))
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
    this.invalidate(800)
    this.bundle.engine.resize()
  }

  // Вписать всю сцену в кадр (клавиша F): центрируем орбитальную камеру на габаритах.
  frameAll(): void {
    // Вписываем здания по их стенам, а не иерархию сцены: в неё попадают
    // котлован и служебные меши, и «Вписать» показывало весь участок 200 м
    // с крошечным зданием посередине.
    const doc = this.getDoc()
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity
    for (const b of doc?.buildings ?? []) {
      for (const f of b.floors) {
        for (const id in f.wallGraph.nodes) {
          const n = f.wallGraph.nodes[id]
          minX = Math.min(minX, (b.origin.x + n.x) * S); maxX = Math.max(maxX, (b.origin.x + n.x) * S)
          minZ = Math.min(minZ, (b.origin.y + n.y) * S); maxZ = Math.max(maxZ, (b.origin.y + n.y) * S)
        }
        minY = Math.min(minY, f.elevation * S)
        maxY = Math.max(maxY, (f.elevation + f.height) * S)
      }
    }
    const cam = this.bundle.camera
    if (!isFinite(minX)) {
      cam.setTarget(new Vector3(0, 3, 0))
      cam.radius = 48
      return
    }
    const cx = (minX + maxX) / 2, cy = (Math.max(0, minY) + maxY) / 2, cz = (minZ + maxZ) / 2
    const span = Math.max(maxX - minX, maxZ - minZ, maxY - Math.max(0, minY))
    cam.setTarget(new Vector3(cx, cy, cz))
    cam.radius = Math.max(8, Math.min(cam.upperRadiusLimit ?? 500, span * 1.5 + 4))
  }

  // Снимок сцены (PNG data-URL). preserveDrawingBuffer включён в createScene.
  captureDataUrl(): string | null {
    const canvas = this.bundle.engine.getRenderingCanvas()
    if (!canvas) return null
    this.bundle.scene.render()
    return canvas.toDataURL("image/png")
  }

  dispose(): void {
    this.detachKeys?.()
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

/** Отрезок пересекает прямоугольник (Лианг — Барски). */
function segmentHitsRect(a: { x: number; y: number }, b: { x: number; y: number }, minX: number, minY: number, maxX: number, maxY: number): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }
  return clip(-dx, a.x - minX) && clip(dx, maxX - a.x) && clip(-dy, a.y - minY) && clip(dy, maxY - a.y)
}
