// ADR: Кэш PBR-материалов Babylon, создаваемых из чистых MaterialDef (lib/builder/materials).
// Один материал на id, переиспользуется всеми мешами — меньше draw calls и аллокаций.
// Текстуры процедурные (DynamicTexture 256×256): рисуем кладку/швы/доски/шум по эвристике
// id+category, чтобы поверхности не были плоским цветом. Текстуры тоже кэшируются по id и
// освобождаются в dispose() явно (материал диспозит свои привязки, но кэш — наш).

import { Color3, DynamicTexture, PBRMaterial, Texture, type Scene } from "@babylonjs/core"
import { MATERIALS, type MaterialDef } from "@/lib/builder/materials"

type Pattern = "brick" | "tile" | "checker" | "marble" | "wood" | "speckle" | "carpet" | "none"

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
  if (has("concrete", "plaster", "loft", "stone", "block")) return "speckle"

  // краска/обои/металл/стекло/ground — чистый цвет (без текстуры)
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

// ── Хелперы ──────────────────────────────────────────────────────────────────

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
