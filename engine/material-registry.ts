// ADR: Кэш PBR-материалов Babylon, создаваемых из чистых MaterialDef (lib/builder/materials).
// Один материал на id, переиспользуется всеми мешами — меньше draw calls и аллокаций.
// Текстуры процедурные (DynamicTexture 256×256): рисуем кладку/швы/доски/шум по эвристике
// id+category, чтобы поверхности не были плоским цветом. Покрыты и «голые» ранее категории:
// кровля (металлочерепица/профлист — швы-волны; черепица — чешуя), фасадные металл/композит/
// панели (сетка панелей), стекло/витраж (переплёт-импосты поверх полупрозрачного фона),
// ground (брусчатка/асфальт/газон). Текстуры тоже кэшируются по id и освобождаются в
// dispose() явно (материал диспозит свои привязки, но кэш — наш).

import { Color3, DynamicTexture, PBRMaterial, Texture, type Scene } from "@babylonjs/core"
import { MATERIALS, type MaterialDef } from "@/lib/builder/materials"

type Pattern =
  | "brick"
  | "tile"
  | "checker"
  | "marble"
  | "wood"
  | "speckle"
  | "carpet"
  | "metalRoof"
  | "shingle"
  | "panel"
  | "glassGrid"
  | "paving"
  | "asphalt"
  | "grass"
  | "none"

const TEX_SIZE = 256

export class MaterialRegistry {
  private cache = new Map<string, PBRMaterial>()
  private textures = new Map<string, DynamicTexture>()
  constructor(private scene: Scene) {}

  get(id: string | undefined): PBRMaterial {
    const key = id && MATERIALS[id] ? id : "concrete"
    const existing = this.cache.get(key)
    if (existing) return existing
    const def = MATERIALS[key]
    const m = new PBRMaterial(`mat_${key}`, this.scene)
    m.albedoColor = Color3.FromHexString(def.color)
    m.metallic = def.metallic
    m.roughness = def.roughness
    m.environmentIntensity = 0.6
    if (def.emissive) m.emissiveColor = Color3.FromHexString(def.emissive)
    if (def.opacity !== undefined && def.opacity < 1) {
      m.alpha = def.opacity
      m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND
    }

    const tex = this.texture(def)
    if (tex) {
      m.albedoTexture = tex.texture
      tex.texture.uScale = tex.scale
      tex.texture.vScale = tex.scale
    }

    m.freeze() // материал неизменяем после создания → меньше пересчётов на кадр (§24)
    this.cache.set(key, m)
    return m
  }

  /** Полупрозрачный материал статуса помещения (для overlay), кэш по цвету. */
  status(hex: string): PBRMaterial {
    const key = `status_${hex}`
    const existing = this.cache.get(key)
    if (existing) return existing
    const m = new PBRMaterial(key, this.scene)
    m.albedoColor = Color3.FromHexString(hex)
    m.emissiveColor = Color3.FromHexString(hex).scale(0.4)
    m.metallic = 0
    m.roughness = 1
    m.alpha = 0.45
    m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND
    this.cache.set(key, m)
    return m
  }

  /** Полупрозрачная вода для водоёмов (зеркало по контуру). Кэш-синглтон. */
  water(): PBRMaterial {
    const key = "__water"
    const existing = this.cache.get(key)
    if (existing) return existing
    const m = new PBRMaterial(key, this.scene)
    m.albedoColor = Color3.FromHexString("#2a6f8f")
    m.metallic = 0.1
    m.roughness = 0.08
    m.alpha = 0.72
    m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND
    m.environmentIntensity = 1.1
    m.emissiveColor = Color3.FromHexString("#0d2733")
    this.cache.set(key, m)
    return m
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose()
    for (const t of this.textures.values()) t.dispose()
    this.cache.clear()
    this.textures.clear()
  }

  // ── Процедурные текстуры ──────────────────────────────────────────────────

  /** Создаёт (или достаёт из кэша) текстуру для материала. null = чистый цвет. */
  private texture(def: MaterialDef): { texture: DynamicTexture; scale: number } | null {
    const pattern = patternFor(def)
    if (pattern === "none") return null
    const cached = this.textures.get(def.id)
    if (cached) return { texture: cached, scale: scaleFor(pattern) }

    const tex = new DynamicTexture(`tex_${def.id}`, TEX_SIZE, this.scene, true)
    tex.wrapU = Texture.WRAP_ADDRESSMODE
    tex.wrapV = Texture.WRAP_ADDRESSMODE
    const ctx = tex.getContext()
    paint(ctx, pattern, def.color)
    tex.update()

    this.textures.set(def.id, tex)
    return { texture: tex, scale: scaleFor(pattern) }
  }
}

// ── Эвристика выбора паттерна ────────────────────────────────────────────────

function patternFor(def: MaterialDef): Pattern {
  const id = def.id.toLowerCase()
  const has = (...keys: string[]): boolean => keys.some((k) => id.includes(k))

  if (has("brick", "clinker")) return "brick"
  if (has("checker")) return "checker"
  if (has("marble")) return "marble"
  if (has("tile", "granite", "terrazzo")) return "tile"
  if (has("parquet", "laminate", "oak", "wenge", "wood", "vinyl")) return "wood"
  if (has("carpet")) return "carpet"

  // ── Кровля ──
  // Скатная черепица (red/brown/green) — «чешуя» рядами со смещением.
  if (has("roof_red", "roof_brown", "roof_green")) return "shingle"
  // Металлочерепица/профлист/мембрана — горизонтальные волны со швами.
  if (id === "metal_roof" || has("roof_") || def.category === "roof") return "metalRoof"

  // ── Стекло / витраж ── (лёгкая сетка переплёта поверх полупрозрачного фона)
  if (def.category === "glass" || has("glass")) return "glassGrid"

  // ── Фасадные металл/композит/панели ── (сетка крупных панелей со швами)
  if (has("composite", "facade_panel")) return "panel"

  // ── Ground ──
  if (has("paving")) return "paving"
  if (has("asphalt")) return "asphalt"
  if (has("grass")) return "grass"

  if (has("concrete", "plaster", "loft", "stone", "block")) return "speckle"

  // краска/обои — чистый цвет (без текстуры)
  return "none"
}

function scaleFor(pattern: Pattern): number {
  switch (pattern) {
    case "brick":
      return 4
    case "tile":
    case "checker":
    case "marble":
      return 6
    case "wood":
      return 3
    case "speckle":
    case "carpet":
      return 4
    case "metalRoof":
    case "shingle":
      return 7
    case "panel":
      return 3
    case "glassGrid":
      return 3
    case "paving":
      return 5
    case "asphalt":
      return 6
    case "grass":
      return 8
    case "none":
      return 1
  }
}

// ── Рисование на canvas ──────────────────────────────────────────────────────

// Контекст рисования Babylon DynamicTexture (fillStyle тут string | ICanvasGradient).
type CanvasCtx = ReturnType<DynamicTexture["getContext"]>

function paint(ctx: CanvasCtx, pattern: Pattern, baseHex: string): void {
  // Фон — базовый цвет (albedoColor домножается сверху как тон).
  ctx.fillStyle = baseHex
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE)

  switch (pattern) {
    case "brick":
      paintBrick(ctx, baseHex)
      break
    case "tile":
      paintTile(ctx, baseHex)
      break
    case "checker":
      paintChecker(ctx, baseHex)
      break
    case "marble":
      paintMarble(ctx, baseHex)
      break
    case "wood":
      paintWood(ctx, baseHex)
      break
    case "speckle":
      paintSpeckle(ctx, baseHex, 900, 0.16)
      break
    case "carpet":
      paintSpeckle(ctx, baseHex, 2600, 0.1)
      break
    case "metalRoof":
      paintMetalRoof(ctx, baseHex)
      break
    case "shingle":
      paintShingle(ctx, baseHex)
      break
    case "panel":
      paintPanel(ctx, baseHex)
      break
    case "glassGrid":
      paintGlassGrid(ctx, baseHex)
      break
    case "paving":
      paintPaving(ctx, baseHex)
      break
    case "asphalt":
      paintSpeckle(ctx, baseHex, 4000, 0.22)
      break
    case "grass":
      paintGrass(ctx, baseHex)
      break
    case "none":
      break
  }
}

function paintBrick(ctx: CanvasCtx, base: string): void {
  const rows = 8
  const cols = 4
  const rowH = TEX_SIZE / rows
  const colW = TEX_SIZE / cols
  ctx.strokeStyle = shade(base, -0.45)
  ctx.lineWidth = 3
  for (let r = 0; r < rows; r++) {
    const y = r * rowH
    line(ctx, 0, y, TEX_SIZE, y)
    const offset = r % 2 === 0 ? 0 : colW / 2
    for (let c = 0; c <= cols; c++) {
      const x = offset + c * colW
      line(ctx, x, y, x, y + rowH)
    }
  }
}

function paintTile(ctx: CanvasCtx, base: string): void {
  const n = 4
  const step = TEX_SIZE / n
  ctx.strokeStyle = shade(base, -0.3)
  ctx.lineWidth = 2
  for (let i = 0; i <= n; i++) {
    const p = i * step
    line(ctx, p, 0, p, TEX_SIZE)
    line(ctx, 0, p, TEX_SIZE, p)
  }
}

function paintChecker(ctx: CanvasCtx, base: string): void {
  const n = 4
  const step = TEX_SIZE / n
  const light = shade(base, 0.55)
  ctx.fillStyle = light
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if ((r + c) % 2 === 0) ctx.fillRect(c * step, r * step, step, step)
    }
  }
}

function paintMarble(ctx: CanvasCtx, base: string): void {
  // Швы как у плитки + светлые прожилки.
  paintTile(ctx, base)
  ctx.strokeStyle = shade(base, 0.4)
  ctx.lineWidth = 1
  const veins = 6
  for (let i = 0; i < veins; i++) {
    const startY = pseudo(i * 7.3) * TEX_SIZE
    ctx.beginPath()
    ctx.moveTo(0, startY)
    let y = startY
    for (let x = 0; x <= TEX_SIZE; x += 24) {
      y += (pseudo(i + x) - 0.5) * 40
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

function paintWood(ctx: CanvasCtx, base: string): void {
  const planks = 4
  const plankH = TEX_SIZE / planks
  for (let p = 0; p < planks; p++) {
    // лёгкая вариация тона доски
    const tone = (pseudo(p * 5.1) - 0.5) * 0.18
    ctx.fillStyle = shade(base, tone)
    ctx.fillRect(0, p * plankH, TEX_SIZE, plankH)
  }
  // тонкие линии между досками
  ctx.strokeStyle = shade(base, -0.4)
  ctx.lineWidth = 2
  for (let p = 0; p <= planks; p++) {
    const y = p * plankH
    line(ctx, 0, y, TEX_SIZE, y)
  }
  // лёгкие продольные «волокна»
  ctx.strokeStyle = shade(base, -0.12)
  ctx.lineWidth = 1
  for (let p = 0; p < planks; p++) {
    const y = p * plankH + plankH * (0.3 + pseudo(p) * 0.4)
    line(ctx, 0, y, TEX_SIZE, y)
  }
}

function paintSpeckle(ctx: CanvasCtx, base: string, count: number, amp: number): void {
  for (let i = 0; i < count; i++) {
    const x = pseudo(i * 1.37) * TEX_SIZE
    const y = pseudo(i * 2.71) * TEX_SIZE
    const d = (pseudo(i * 3.91) - 0.5) * 2 * amp
    ctx.fillStyle = shade(base, d)
    const s = 1 + Math.floor(pseudo(i * 0.53) * 2)
    ctx.fillRect(x, y, s, s)
  }
}

// Металлочерепица/профлист: горизонтальные «волны» — ряды чуть светлее/темнее base,
// разделённые тонкими линиями-стыками. Детерминированно через sine, без Math.random.
function paintMetalRoof(ctx: CanvasCtx, base: string): void {
  const rows = 10
  const rowH = TEX_SIZE / rows
  for (let r = 0; r < rows; r++) {
    const y = r * rowH
    // плавная «волна» профиля: чередуем светлый верх и тёмный низ ряда
    const tone = Math.sin((r / rows) * Math.PI * 2) * 0.14
    ctx.fillStyle = shade(base, tone)
    ctx.fillRect(0, y, TEX_SIZE, rowH)
    // блик у верхней кромки ряда
    ctx.fillStyle = shade(base, 0.22)
    ctx.fillRect(0, y, TEX_SIZE, Math.max(1, rowH * 0.14))
  }
  // тонкие линии-стыки между рядами
  ctx.strokeStyle = shade(base, -0.4)
  ctx.lineWidth = 2
  for (let r = 0; r <= rows; r++) {
    const y = r * rowH
    line(ctx, 0, y, TEX_SIZE, y)
  }
}

// Скатная черепица: ряды прямоугольных «чешуек» со смещением через ряд,
// со скруглённой нижней кромкой и затенением.
function paintShingle(ctx: CanvasCtx, base: string): void {
  const rows = 8
  const cols = 6
  const rowH = TEX_SIZE / rows
  const colW = TEX_SIZE / cols
  const r2 = Math.min(rowH, colW) * 0.4
  for (let r = 0; r < rows; r++) {
    const y = r * rowH
    const offset = r % 2 === 0 ? 0 : -colW / 2
    for (let c = -1; c <= cols; c++) {
      const x = offset + c * colW
      // лёгкая вариация тона каждой чешуйки
      const tone = (pseudo(r * 9.1 + c * 3.7) - 0.5) * 0.2
      ctx.fillStyle = shade(base, tone)
      roundedRect(ctx, x + 1, y, colW - 2, rowH * 1.15, r2)
      ctx.fill()
      // затенение в нижней части чешуйки — объём
      ctx.fillStyle = shade(base, -0.28)
      ctx.fillRect(x + 1, y + rowH * 0.78, colW - 2, rowH * 0.22)
    }
  }
  // тонкие разделители рядов
  ctx.strokeStyle = shade(base, -0.45)
  ctx.lineWidth = 1
  for (let r = 0; r <= rows; r++) {
    const y = r * rowH
    line(ctx, 0, y, TEX_SIZE, y)
  }
}

// Фасадные панели/композит: сетка крупных панелей с тонкими затемнёнными швами
// и лёгким блик-контуром (фаска панели).
function paintPanel(ctx: CanvasCtx, base: string): void {
  const n = 3
  const step = TEX_SIZE / n
  // лёгкая вариация тона панелей
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const tone = (pseudo(r * 4.3 + c * 7.9) - 0.5) * 0.08
      ctx.fillStyle = shade(base, tone)
      ctx.fillRect(c * step, r * step, step, step)
    }
  }
  // швы
  ctx.strokeStyle = shade(base, -0.35)
  ctx.lineWidth = 3
  for (let i = 0; i <= n; i++) {
    const p = i * step
    line(ctx, p, 0, p, TEX_SIZE)
    line(ctx, 0, p, TEX_SIZE, p)
  }
  // тонкий блик-фаска рядом со швом
  ctx.strokeStyle = shade(base, 0.2)
  ctx.lineWidth = 1
  for (let i = 0; i <= n; i++) {
    const p = i * step + 2
    line(ctx, p, 0, p, TEX_SIZE)
    line(ctx, 0, p, TEX_SIZE, p)
  }
}

// Стекло/витраж: крупная сетка переплёта (импосты). Фон не трогаем (альфа материала
// задаётся отдельно через def.opacity) — рисуем только тонкие тёмные линии сетки и блик.
function paintGlassGrid(ctx: CanvasCtx, base: string): void {
  const n = 3
  const step = TEX_SIZE / n
  // импосты (переплёт) — тёмные линии
  ctx.strokeStyle = shade(base, -0.5)
  ctx.lineWidth = 4
  for (let i = 0; i <= n; i++) {
    const p = i * step
    line(ctx, p, 0, p, TEX_SIZE)
    line(ctx, 0, p, TEX_SIZE, p)
  }
  // лёгкий диагональный блик внутри ячеек
  ctx.strokeStyle = shade(base, 0.45)
  ctx.lineWidth = 1
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = c * step
      const y = r * step
      line(ctx, x + step * 0.2, y + step * 0.75, x + step * 0.75, y + step * 0.2)
    }
  }
}

// Брусчатка: квадратные элементы рядами со смещением через ряд (как кирпич, но квадраты).
function paintPaving(ctx: CanvasCtx, base: string): void {
  const n = 6
  const step = TEX_SIZE / n
  for (let r = 0; r < n; r++) {
    const offset = r % 2 === 0 ? 0 : step / 2
    for (let c = -1; c <= n; c++) {
      const x = offset + c * step
      const tone = (pseudo(r * 6.7 + c * 2.3) - 0.5) * 0.18
      ctx.fillStyle = shade(base, tone)
      ctx.fillRect(x + 1, r * step + 1, step - 2, step - 2)
    }
  }
  // тёмные швы по сетке
  ctx.strokeStyle = shade(base, -0.4)
  ctx.lineWidth = 2
  for (let r = 0; r <= n; r++) {
    const y = r * step
    line(ctx, 0, y, TEX_SIZE, y)
  }
  for (let r = 0; r < n; r++) {
    const offset = r % 2 === 0 ? 0 : step / 2
    for (let c = -1; c <= n; c++) {
      const x = offset + c * step
      line(ctx, x, r * step, x, (r + 1) * step)
    }
  }
}

// Газон: мелкая зелёная крапинка (светлее/темнее base) для лёгкой неоднородности.
function paintGrass(ctx: CanvasCtx, base: string): void {
  for (let i = 0; i < 5000; i++) {
    const x = pseudo(i * 1.13) * TEX_SIZE
    const y = pseudo(i * 2.59) * TEX_SIZE
    const d = (pseudo(i * 3.17) - 0.5) * 2 * 0.28
    ctx.fillStyle = shade(base, d)
    const s = 1 + Math.floor(pseudo(i * 0.61) * 2)
    ctx.fillRect(x, y, s, s)
  }
}

// ── Хелперы ──────────────────────────────────────────────────────────────────

function roundedRect(ctx: CanvasCtx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2)
  ctx.lineTo(x + rr, y + h)
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI)
  ctx.lineTo(x, y + rr)
  ctx.arc(x + rr, y + rr, rr, Math.PI, (3 * Math.PI) / 2)
  ctx.closePath()
}

function line(ctx: CanvasCtx, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

/** Детерминированный псевдослучай в [0,1) — без зависимости от Math.random для стабильных текстур. */
function pseudo(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** Осветляет (amount>0) или затемняет (amount<0) hex-цвет, amount в [-1,1]. */
function shade(hex: string, amount: number): string {
  const c = Color3.FromHexString(hex)
  const f = (v: number): number => {
    const t = amount > 0 ? v + (1 - v) * amount : v * (1 + amount)
    return Math.max(0, Math.min(1, t))
  }
  return new Color3(f(c.r), f(c.g), f(c.b)).toHexString()
}
