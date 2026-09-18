// ADR: Премиальное окружение сцены (§9.2): небо-градиент, мягкий направленный свет +
// тени + полусфера, светящаяся сетка земли (emissive + GlowLayer), газон, ArcRotate-
// камера. Возвращает «bundle» — движок управляет жизненным циклом и пересборкой мешей.

import {
  ArcRotateCamera,
  Color3,
  Color4,
  CubeTexture,
  DirectionalLight,
  DynamicTexture,
  Engine,
  FxaaPostProcess,
  GlowLayer,
  HemisphericLight,
  HighlightLayer,
  Layer,
  Mesh,
  MeshBuilder,
  RenderTargetTexture,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core"
import { MATERIALS } from "@/lib/builder/materials"

export interface SceneBundle {
  engine: Engine
  scene: Scene
  camera: ArcRotateCamera
  sun: DirectionalLight
  shadow: ShadowGenerator
  glow: GlowLayer
  highlight: HighlightLayer
  ground: Mesh
}

/**
 * Окружение для PBR: без него материалы остаются «пластмассовыми» — им нечего
 * отражать. Кубическую карту рисуем сами (небо сверху, земля снизу, горизонт по
 * бокам) — без внешних файлов и запросов в сеть.
 */
function buildEnvironment(scene: Scene): void {
  const size = 128
  const face = (paint: (ctx: CanvasRenderingContext2D) => void): string => {
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) return ""
    paint(ctx)
    return canvas.toDataURL("image/png")
  }
  const side = face((ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, size)
    g.addColorStop(0, "#9ec6ee")
    g.addColorStop(0.5, "#dbe8f5")
    g.addColorStop(0.5, "#b9b4aa")
    g.addColorStop(1, "#8e8a82")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  })
  const top = face((ctx) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 1.4)
    g.addColorStop(0, "#ffffff")
    g.addColorStop(1, "#8fb8e6")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  })
  const bottom = face((ctx) => {
    ctx.fillStyle = "#7d7a72"
    ctx.fillRect(0, 0, size, size)
  })
  if (!side || !top || !bottom) return
  // порядок граней Babylon: px, py, pz, nx, ny, nz
  const env = CubeTexture.CreateFromImages([side, top, side, side, bottom, side], scene, false)
  env.gammaSpace = true
  scene.environmentTexture = env
  scene.environmentIntensity = 0.45
}

function buildSkyGradient(scene: Scene): void {
  const tex = new DynamicTexture("sky", { width: 8, height: 512 }, scene, false)
  const ctx = tex.getContext()
  const grad = ctx.createLinearGradient(0, 0, 0, 512)
  grad.addColorStop(0, "#6fa8e6")
  grad.addColorStop(0.55, "#aed1f2")
  grad.addColorStop(1, "#e9f2fb")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 8, 512)
  tex.update()
  const layer = new Layer("skyLayer", null, scene, true)
  layer.texture = tex
}

function buildGlowingGrid(scene: Scene, size: number): Mesh {
  const px = 1024
  const div = size // 1 линия на метр
  const tex = new DynamicTexture("grid", { width: px, height: px }, scene, false)
  tex.hasAlpha = true
  const ctx = tex.getContext()
  ctx.clearRect(0, 0, px, px)
  for (let i = 0; i <= div; i++) {
    const p = (i / div) * px
    const major = i % 10 === 0
    // сетка участка — вспомогательная разметка, а не узор: делаем её едва заметной
    ctx.strokeStyle = major ? "rgba(140,170,190,0.18)" : "rgba(140,170,190,0.07)"
    ctx.lineWidth = major ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(p, 0)
    ctx.lineTo(p, px)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, p)
    ctx.lineTo(px, p)
    ctx.stroke()
  }
  tex.update()
  const m = new StandardMaterial("gridMat", scene)
  m.diffuseTexture = tex
  m.diffuseTexture.hasAlpha = true
  m.useAlphaFromDiffuseTexture = true
  m.emissiveTexture = tex
  m.emissiveColor = new Color3(0.04, 0.06, 0.08)
  m.disableLighting = true
  m.backFaceCulling = false
  const grid = MeshBuilder.CreateGround("gridPlane", { width: size, height: size }, scene)
  grid.material = m
  grid.position.y = 0.06
  grid.isPickable = false
  return grid
}

export function createScene(canvas: HTMLCanvasElement, siteSizeM = 200): SceneBundle {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true)
  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.91, 0.95, 0.99, 1)
  scene.fogMode = Scene.FOGMODE_EXP2
  scene.fogColor = new Color3(0.84, 0.9, 0.97)
  scene.fogDensity = 0.0011

  // Тон и контраст как у фотографии (ACES) — без этого бетон и штукатурка
  // выглядят плоско-серыми, а солнце «выжигает» стены.
  const ip = scene.imageProcessingConfiguration
  ip.toneMappingEnabled = true
  ip.toneMappingType = 1 // ACES
  ip.contrast = 1.2
  ip.exposure = 1.05

  buildEnvironment(scene)
  buildSkyGradient(scene)

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene)
  hemi.intensity = 0.42
  hemi.groundColor = new Color3(0.45, 0.46, 0.44)
  hemi.diffuse = new Color3(1, 0.99, 0.95)

  // «отражённый» свет с теневой стороны: без него тени проваливаются в черноту
  const fill = new DirectionalLight("fill", new Vector3(0.7, -0.4, 0.6), scene)
  fill.intensity = 0.22
  fill.diffuse = new Color3(0.86, 0.9, 1)
  fill.specular = new Color3(0, 0, 0)

  const sun = new DirectionalLight("sun", new Vector3(-0.6, -1.2, -0.5), scene)
  sun.position = new Vector3(40, 70, 30)
  sun.intensity = 2.1
  sun.diffuse = new Color3(1, 0.97, 0.9)
  const shadow = new ShadowGenerator(2048, sun)
  shadow.useBlurExponentialShadowMap = true
  shadow.blurKernel = 32
  shadow.darkness = 0.38
  // Перф (§24): сцена статична между правками — карта теней рисуется один раз, а не
  // каждый кадр. Движок вызывает resetRefreshCounter() после каждой пересборки.
  const shadowMap = shadow.getShadowMap()
  if (shadowMap) shadowMap.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE

  // Газон участка — сетка с подразбиением для редактирования рельефа (кисти).
  const ground = MeshBuilder.CreateGround("ground", { width: siteSizeM, height: siteSizeM, subdivisions: 64, updatable: true }, scene)
  const gmat = new StandardMaterial("groundMat", scene)
  gmat.diffuseColor = Color3.FromHexString(MATERIALS.grass.color)
  gmat.specularColor = new Color3(0.02, 0.02, 0.02)
  ground.material = gmat
  ground.receiveShadows = true
  ground.isPickable = true
  ground.metadata = { kind: "ground" }

  buildGlowingGrid(scene, siteSizeM)

  const camera = new ArcRotateCamera("cam", -Math.PI / 4, Math.PI / 3.2, 48, new Vector3(0, 3, 0), scene)
  camera.attachControl(canvas, true)
  camera.lowerRadiusLimit = 1.5
  camera.upperRadiusLimit = 520
  camera.lowerBetaLimit = 0.15
  camera.upperBetaLimit = Math.PI / 2.05
  // зум колесом пропорционально расстоянию и к точке под курсором — как в CAD:
  // одинаково удобно и на весь квартал, и на дверной проём
  camera.wheelDeltaPercentage = 0.04
  // вращение (ЛКМ) спокойнее: с заводским 1000 модель «улетала» от лёгкого движения
  camera.angularSensibilityX = 1800
  camera.angularSensibilityY = 1800
  camera.zoomToMouseLocation = true
  camera.panningSensibility = 80
  camera.minZ = 0.1
  camera.maxZ = 2200

  // Сглаживание краёв: без него грани стен «лесенкой» на любом мониторе.
  new FxaaPostProcess("fxaa", 1, camera)

  const glow = new GlowLayer("glow", scene)
  glow.intensity = 0.6
  // Светятся только лампы и экраны (материалы glow_*). Иначе слой подхватывал
  // любой материал с собственным свечением — стекло, статусы помещений, ручки —
  // и обводил здание мутным жёлто-голубым ореолом.
  glow.customEmissiveColorSelector = (_mesh, _subMesh, material, result) => {
    const own = material as unknown as { name?: string; emissiveColor?: Color3 }
    if (own?.name?.startsWith("glow_") && own.emissiveColor) result.set(own.emissiveColor.r, own.emissiveColor.g, own.emissiveColor.b, 1)
    else result.set(0, 0, 0, 0)
  }
  const highlight = new HighlightLayer("hl", scene)

  return { engine, scene, camera, sun, shadow, glow, highlight, ground }
}
