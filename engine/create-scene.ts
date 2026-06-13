// ADR: Премиальное окружение сцены (§9.2): небо-градиент, мягкий направленный свет +
// тени + полусфера, светящаяся сетка земли (emissive + GlowLayer), газон, ArcRotate-
// камера. Возвращает «bundle» — движок управляет жизненным циклом и пересборкой мешей.

import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  Engine,
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
    ctx.strokeStyle = major ? "rgba(56,189,248,0.55)" : "rgba(56,189,248,0.22)"
    ctx.lineWidth = major ? 2.5 : 1
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
  m.emissiveColor = new Color3(0.22, 0.74, 0.97)
  m.disableLighting = true
  m.backFaceCulling = false
  const grid = MeshBuilder.CreateGround("gridPlane", { width: size, height: size }, scene)
  grid.material = m
  grid.position.y = 0.06
  grid.isPickable = false
  return grid
}

export function createScene(canvas: HTMLCanvasElement, siteSizeM = 60): SceneBundle {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true)
  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.91, 0.95, 0.99, 1)
  scene.fogMode = Scene.FOGMODE_EXP2
  scene.fogColor = new Color3(0.84, 0.9, 0.97)
  scene.fogDensity = 0.0035

  buildSkyGradient(scene)

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene)
  hemi.intensity = 0.6
  hemi.groundColor = new Color3(0.4, 0.45, 0.5)

  const sun = new DirectionalLight("sun", new Vector3(-0.6, -1.2, -0.5), scene)
  sun.position = new Vector3(40, 70, 30)
  sun.intensity = 2.4
  const shadow = new ShadowGenerator(1024, sun)
  shadow.useBlurExponentialShadowMap = true
  shadow.blurKernel = 24
  shadow.darkness = 0.55
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
  camera.lowerRadiusLimit = 6
  camera.upperRadiusLimit = 140
  camera.lowerBetaLimit = 0.15
  camera.upperBetaLimit = Math.PI / 2.05
  camera.wheelPrecision = 3
  camera.panningSensibility = 80
  camera.minZ = 0.1
  camera.maxZ = 600

  const glow = new GlowLayer("glow", scene)
  glow.intensity = 0.6
  const highlight = new HighlightLayer("hl", scene)

  return { engine, scene, camera, sun, shadow, glow, highlight, ground }
}
