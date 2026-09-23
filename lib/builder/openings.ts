// ADR: Пресеты проёмов (Фаза 2.0) — типы дверей/окон с размерами по умолчанию.
// Подписи — в словаре (adminBuilder.openingPresets): здесь только размеры.

import type { Messages } from "@/lib/i18n/messages"

/** Ключ подписи проёма в словаре — он же его variant (витраж на все этажи: curtainAll). */
export type OpeningNameKey = keyof Messages["adminBuilder"]["openingPresets"]

// variant хранится в Opening; wall-builder рисует геометрию по variant, ToolOptions
// и PropertyPanel дают выбор. Размеры можно переопределять у выбранного проёма.

export interface OpeningPreset {
  variant: string
  /** ключ подписи в словаре: adminBuilder.openingPresets.door / .window */
  label: OpeningNameKey
  width: number // мм
  height: number
  sill: number
}

export const DOOR_PRESETS: OpeningPreset[] = [
  { variant: "interior", label: "interior", width: 800, height: 2050, sill: 0 },
  { variant: "single", label: "single", width: 1000, height: 2100, sill: 0 },
  { variant: "double", label: "double", width: 1600, height: 2200, sill: 0 },
  { variant: "sliding", label: "sliding", width: 1800, height: 2200, sill: 0 },
  { variant: "garage", label: "garage", width: 3000, height: 2600, sill: 0 },
  { variant: "arch", label: "arch", width: 1200, height: 2500, sill: 0 },
]

export const WINDOW_PRESETS: OpeningPreset[] = [
  { variant: "standard", label: "standard", width: 1200, height: 1400, sill: 900 },
  { variant: "panoramic", label: "panoramic", width: 2600, height: 2100, sill: 200 },
  { variant: "small", label: "small", width: 700, height: 700, sill: 1300 },
  { variant: "wide", label: "wide", width: 2000, height: 1300, sill: 850 },
  // витраж: занимает стену целиком — размеры подставляются по самой стене
  { variant: "curtain", label: "curtain", width: 6000, height: 2600, sill: 100 },
  // сплошная лента остекления через все этажи здания
  { variant: "curtain-all", label: "curtainAll", width: 6000, height: 2600, sill: 100 },
]

/** Витражные варианты остекления. */
export function isCurtain(variant: string): boolean {
  return variant === "curtain" || variant === "curtain-all"
}

/** Отступ витража от примыкающих стен и от перекрытия, мм. */
export const CURTAIN_MARGIN = 150
export const CURTAIN_TOP_GAP = 350
export const CURTAIN_SILL = 100

/**
 * Размеры витража под конкретную стену: во всю длину между примыкающими стенами
 * и во всю высоту этажа, оставляя полосу под перекрытие.
 */
export function curtainSize(wallLengthMm: number, wallHeightMm: number): { width: number; height: number; sill: number; offset: number } {
  const width = Math.max(1200, Math.round(wallLengthMm - CURTAIN_MARGIN * 2))
  const height = Math.max(1200, Math.round(wallHeightMm - CURTAIN_SILL - CURTAIN_TOP_GAP))
  return { width, height, sill: CURTAIN_SILL, offset: Math.round(wallLengthMm / 2) }
}

export function presetsFor(type: "door" | "window"): OpeningPreset[] {
  return type === "door" ? DOOR_PRESETS : WINDOW_PRESETS
}

export function findPreset(type: "door" | "window", variant: string): OpeningPreset {
  const list = presetsFor(type)
  return list.find((p) => p.variant === variant) ?? list[0]
}

/**
 * Та же стена на другом этаже: ищем ребро с теми же концами (с допуском), чтобы
 * витраж шёл сплошной лентой снизу доверху.
 */
export function sameWallOnFloor(
  graph: { nodes: Record<string, { x: number; y: number }>; edges: Record<string, { id: string; a: string; b: string }> },
  a: { x: number; y: number },
  b: { x: number; y: number },
  tolMm = 400,
): string | null {
  const near = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) <= tolMm
  for (const id in graph.edges) {
    const e = graph.edges[id]
    const p = graph.nodes[e.a], q = graph.nodes[e.b]
    if (!p || !q) continue
    if ((near(p, a) && near(q, b)) || (near(p, b) && near(q, a))) return id
  }
  return null
}
