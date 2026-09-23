// ADR: Чистые определения материалов (id, цвет, PBR-параметры) и дизайн-токены (§5.1).
// Без Babylon — движок (engine/material-registry) создаёт из этих DTO PBR-материалы и
// кэширует. Замена на текстуры/GLB-материалы = правка данных, без изменения движка.
//
// Подписи материалов здесь не лежат: они в словаре (adminBuilder.materials),
// ключ совпадает с id. Иначе описание физики материала пришлось бы держать в
// двух языках.

import type { Messages } from "@/lib/i18n/messages"

export interface MaterialDef {
  id: string
  category: "wall" | "floor" | "facade" | "roof" | "ground" | "glass" | "object"
  color: string // hex
  roughness: number
  metallic: number
  opacity?: number
  emissive?: string
}

export const MATERIALS: Record<string, MaterialDef> = {
  grass: { id: "grass", category: "ground", color: "#6E8F5A", roughness: 1, metallic: 0 },
  asphalt: { id: "asphalt", category: "ground", color: "#3F3F46", roughness: 0.95, metallic: 0 },
  paving: { id: "paving", category: "ground", color: "#9CA3AF", roughness: 0.9, metallic: 0 },
  concrete: { id: "concrete", category: "wall", color: "#B8B5B2", roughness: 0.85, metallic: 0 },
  plaster_white: { id: "plaster_white", category: "facade", color: "#EDEAE3", roughness: 0.8, metallic: 0 },
  brick: { id: "brick", category: "facade", color: "#B4642E", roughness: 0.9, metallic: 0 },
  block: { id: "block", category: "wall", color: "#D8D8D2", roughness: 0.85, metallic: 0 },
  glass: { id: "glass", category: "glass", color: "#9FD3F0", roughness: 0.1, metallic: 0.1, opacity: 0.35 },
  laminate: { id: "laminate", category: "floor", color: "#C9A86A", roughness: 0.6, metallic: 0 },
  tile: { id: "tile", category: "floor", color: "#E2E8F0", roughness: 0.4, metallic: 0 },
  metal_roof: { id: "metal_roof", category: "roof", color: "#374151", roughness: 0.5, metallic: 0.6 },
  slab: { id: "slab", category: "floor", color: "#E7E5E4", roughness: 0.9, metallic: 0 },

  // ── Полы ──
  parquet: { id: "parquet", category: "floor", color: "#B07A43", roughness: 0.55, metallic: 0 },
  oak_floor: { id: "oak_floor", category: "floor", color: "#C8A06A", roughness: 0.6, metallic: 0 },
  wenge_floor: { id: "wenge_floor", category: "floor", color: "#5A4632", roughness: 0.55, metallic: 0 },
  marble: { id: "marble", category: "floor", color: "#ECECEC", roughness: 0.25, metallic: 0.05 },
  granite: { id: "granite", category: "floor", color: "#8A8F98", roughness: 0.4, metallic: 0 },
  carpet_gray: { id: "carpet_gray", category: "floor", color: "#6B7280", roughness: 1, metallic: 0 },
  carpet_blue: { id: "carpet_blue", category: "floor", color: "#3B5374", roughness: 1, metallic: 0 },
  vinyl: { id: "vinyl", category: "floor", color: "#A8A29E", roughness: 0.7, metallic: 0 },
  epoxy: { id: "epoxy", category: "floor", color: "#D6D3D1", roughness: 0.3, metallic: 0.1 },
  checker: { id: "checker", category: "floor", color: "#1F2937", roughness: 0.35, metallic: 0 },
  terrazzo: { id: "terrazzo", category: "floor", color: "#E5E1D8", roughness: 0.4, metallic: 0 },

  // ── Стены (отделка) ──
  paint_white: { id: "paint_white", category: "wall", color: "#F3F4F6", roughness: 0.85, metallic: 0 },
  paint_gray: { id: "paint_gray", category: "wall", color: "#9CA3AF", roughness: 0.85, metallic: 0 },
  paint_blue: { id: "paint_blue", category: "wall", color: "#3B5374", roughness: 0.85, metallic: 0 },
  paint_green: { id: "paint_green", category: "wall", color: "#3F6F52", roughness: 0.85, metallic: 0 },
  paint_terra: { id: "paint_terra", category: "wall", color: "#B4642E", roughness: 0.85, metallic: 0 },
  wallpaper: { id: "wallpaper", category: "wall", color: "#E7E0D6", roughness: 0.8, metallic: 0 },
  stone: { id: "stone", category: "wall", color: "#7A756E", roughness: 0.95, metallic: 0 },
  wood_panel: { id: "wood_panel", category: "wall", color: "#9A6A3A", roughness: 0.6, metallic: 0 },
  loft: { id: "loft", category: "wall", color: "#8B8680", roughness: 0.9, metallic: 0 },

  // ── Фасады ──
  clinker: { id: "clinker", category: "facade", color: "#9C4A2E", roughness: 0.8, metallic: 0 },
  composite: { id: "composite", category: "facade", color: "#4B5563", roughness: 0.5, metallic: 0.3 },
  facade_panel: { id: "facade_panel", category: "facade", color: "#94A3B8", roughness: 0.6, metallic: 0.2 },
  facade_wood: { id: "facade_wood", category: "facade", color: "#A87B4A", roughness: 0.7, metallic: 0 },
  curtain_glass: { id: "curtain_glass", category: "glass", color: "#7FB7DC", roughness: 0.1, metallic: 0.2, opacity: 0.45 },

  // ── Кровля ──
  roof_red: { id: "roof_red", category: "roof", color: "#9C2E2E", roughness: 0.6, metallic: 0.2 },
  roof_brown: { id: "roof_brown", category: "roof", color: "#5A3A28", roughness: 0.6, metallic: 0.2 },
  roof_green: { id: "roof_green", category: "roof", color: "#2F5E3F", roughness: 0.6, metallic: 0.2 },
  roof_membrane: { id: "roof_membrane", category: "roof", color: "#5B5F66", roughness: 0.85, metallic: 0 },

  // ── Полы (расширение) ──
  laminate_light: { id: "laminate_light", category: "floor", color: "#D8C49A", roughness: 0.6, metallic: 0 },
  laminate_dark: { id: "laminate_dark", category: "floor", color: "#5C4530", roughness: 0.6, metallic: 0 },
  laminate_gray: { id: "laminate_gray", category: "floor", color: "#9A958E", roughness: 0.6, metallic: 0 },
  parquet_herringbone: { id: "parquet_herringbone", category: "floor", color: "#B5803F", roughness: 0.55, metallic: 0 },
  parquet_deck: { id: "parquet_deck", category: "floor", color: "#C29A5E", roughness: 0.55, metallic: 0 },
  ash_floor: { id: "ash_floor", category: "floor", color: "#D6C2A0", roughness: 0.6, metallic: 0 },
  walnut_floor: { id: "walnut_floor", category: "floor", color: "#6B4A30", roughness: 0.55, metallic: 0 },
  tile_white: { id: "tile_white", category: "floor", color: "#F4F5F7", roughness: 0.35, metallic: 0 },
  tile_gray: { id: "tile_gray", category: "floor", color: "#B0B4BA", roughness: 0.35, metallic: 0 },
  tile_beige: { id: "tile_beige", category: "floor", color: "#DCD2C0", roughness: 0.35, metallic: 0 },
  tile_black: { id: "tile_black", category: "floor", color: "#1F2123", roughness: 0.35, metallic: 0 },
  granite_dark: { id: "granite_dark", category: "floor", color: "#3A3D42", roughness: 0.4, metallic: 0 },
  granite_beige: { id: "granite_beige", category: "floor", color: "#CBBFA8", roughness: 0.4, metallic: 0 },
  marble_white: { id: "marble_white", category: "floor", color: "#F1F0EC", roughness: 0.2, metallic: 0.05 },
  marble_black: { id: "marble_black", category: "floor", color: "#26282B", roughness: 0.2, metallic: 0.05 },
  marble_emperador: { id: "marble_emperador", category: "floor", color: "#5A4534", roughness: 0.22, metallic: 0.05 },
  concrete_polished: { id: "concrete_polished", category: "floor", color: "#A8A6A2", roughness: 0.3, metallic: 0.05 },
  carpet_beige: { id: "carpet_beige", category: "floor", color: "#C9BCA4", roughness: 1, metallic: 0 },
  carpet_green: { id: "carpet_green", category: "floor", color: "#4A6B52", roughness: 1, metallic: 0 },
  carpet_red: { id: "carpet_red", category: "floor", color: "#8A3A3A", roughness: 1, metallic: 0 },
  carpet_dark: { id: "carpet_dark", category: "floor", color: "#33363B", roughness: 1, metallic: 0 },
  vinyl_wood: { id: "vinyl_wood", category: "floor", color: "#B89368", roughness: 0.65, metallic: 0 },
  vinyl_stone: { id: "vinyl_stone", category: "floor", color: "#9B9690", roughness: 0.65, metallic: 0 },
  cork: { id: "cork", category: "floor", color: "#C68C4E", roughness: 0.85, metallic: 0 },
  epoxy_gray: { id: "epoxy_gray", category: "floor", color: "#8E8C88", roughness: 0.3, metallic: 0.1 },
  epoxy_blue: { id: "epoxy_blue", category: "floor", color: "#3C5A78", roughness: 0.3, metallic: 0.1 },
  checker_bw: { id: "checker_bw", category: "floor", color: "#E8E8E8", roughness: 0.35, metallic: 0 },
  painted_board: { id: "painted_board", category: "floor", color: "#C7CBC4", roughness: 0.7, metallic: 0 },
  terrazzo_dark: { id: "terrazzo_dark", category: "floor", color: "#3D3A38", roughness: 0.4, metallic: 0 },
  rubber_floor: { id: "rubber_floor", category: "floor", color: "#4A4D52", roughness: 0.9, metallic: 0 },

  // ── Стены (расширение) ──
  paint_beige: { id: "paint_beige", category: "wall", color: "#DDD2BC", roughness: 0.85, metallic: 0 },
  paint_yellow: { id: "paint_yellow", category: "wall", color: "#E3C04C", roughness: 0.85, metallic: 0 },
  paint_rose: { id: "paint_rose", category: "wall", color: "#D89C9C", roughness: 0.85, metallic: 0 },
  paint_mint: { id: "paint_mint", category: "wall", color: "#A7CFBF", roughness: 0.85, metallic: 0 },
  paint_graphite: { id: "paint_graphite", category: "wall", color: "#3A3D42", roughness: 0.85, metallic: 0 },
  paint_lavender: { id: "paint_lavender", category: "wall", color: "#B6A9D6", roughness: 0.85, metallic: 0 },
  wallpaper_floral: { id: "wallpaper_floral", category: "wall", color: "#D9CBB8", roughness: 0.8, metallic: 0 },
  wallpaper_stripe: { id: "wallpaper_stripe", category: "wall", color: "#CBC6BB", roughness: 0.8, metallic: 0 },
  wallpaper_gray: { id: "wallpaper_gray", category: "wall", color: "#A6A29B", roughness: 0.8, metallic: 0 },
  wallpaper_blue: { id: "wallpaper_blue", category: "wall", color: "#7C96B4", roughness: 0.8, metallic: 0 },
  wallpaper_dark: { id: "wallpaper_dark", category: "wall", color: "#3F4147", roughness: 0.8, metallic: 0 },
  venetian: { id: "venetian", category: "wall", color: "#D8CEBD", roughness: 0.45, metallic: 0.05 },
  decor_plaster: { id: "decor_plaster", category: "wall", color: "#CFC8BC", roughness: 0.75, metallic: 0 },
  brick_white: { id: "brick_white", category: "wall", color: "#E6E2DA", roughness: 0.9, metallic: 0 },
  brick_red: { id: "brick_red", category: "wall", color: "#A64A2E", roughness: 0.9, metallic: 0 },
  brick_gray: { id: "brick_gray", category: "wall", color: "#8A8680", roughness: 0.9, metallic: 0 },
  wood_panel_light: { id: "wood_panel_light", category: "wall", color: "#C9A879", roughness: 0.6, metallic: 0 },
  wood_panel_dark: { id: "wood_panel_dark", category: "wall", color: "#5A4230", roughness: 0.6, metallic: 0 },
  panel_3d: { id: "panel_3d", category: "wall", color: "#E8E4DC", roughness: 0.7, metallic: 0 },
  tile_subway: { id: "tile_subway", category: "wall", color: "#F0F1F2", roughness: 0.3, metallic: 0 },
  tile_subway_green: { id: "tile_subway_green", category: "wall", color: "#4F7A66", roughness: 0.3, metallic: 0 },
  green_wall: { id: "green_wall", category: "wall", color: "#3F7A47", roughness: 0.95, metallic: 0 },
  microcement: { id: "microcement", category: "wall", color: "#B9B4AC", roughness: 0.6, metallic: 0 },
  stone_slate: { id: "stone_slate", category: "wall", color: "#4A4E52", roughness: 0.9, metallic: 0 },
  mirror_wall: { id: "mirror_wall", category: "wall", color: "#C9D6DC", roughness: 0.05, metallic: 0.9 },
  felt_panel: { id: "felt_panel", category: "wall", color: "#7D7A74", roughness: 1, metallic: 0 },
  gypsum_board: { id: "gypsum_board", category: "wall", color: "#EDEAE4", roughness: 0.85, metallic: 0 },
  marble_wall: { id: "marble_wall", category: "wall", color: "#ECEBE7", roughness: 0.25, metallic: 0.05 },
  concrete_raw: { id: "concrete_raw", category: "wall", color: "#A09C97", roughness: 0.95, metallic: 0 },
  brick_loft_dark: { id: "brick_loft_dark", category: "wall", color: "#4A3A30", roughness: 0.9, metallic: 0 },
  cork_wall: { id: "cork_wall", category: "wall", color: "#C08A4E", roughness: 0.85, metallic: 0 },
  paint_black: { id: "paint_black", category: "wall", color: "#26282B", roughness: 0.85, metallic: 0 },
  paint_olive: { id: "paint_olive", category: "wall", color: "#6E7244", roughness: 0.85, metallic: 0 },
  paint_navy: { id: "paint_navy", category: "wall", color: "#28385A", roughness: 0.85, metallic: 0 },

  // ── Потолки (id ceil_*, category "wall") ──
  ceil_white: { id: "ceil_white", category: "wall", color: "#F7F7F5", roughness: 0.85, metallic: 0 },
  ceil_stretch_gloss: { id: "ceil_stretch_gloss", category: "wall", color: "#EFF2F4", roughness: 0.15, metallic: 0.05 },
  ceil_stretch_matte: { id: "ceil_stretch_matte", category: "wall", color: "#F2F1EE", roughness: 0.8, metallic: 0 },
  ceil_stretch_black: { id: "ceil_stretch_black", category: "wall", color: "#1E2022", roughness: 0.2, metallic: 0.05 },
  ceil_armstrong: { id: "ceil_armstrong", category: "wall", color: "#E8E8E4", roughness: 0.9, metallic: 0 },
  ceil_slats_white: { id: "ceil_slats_white", category: "wall", color: "#EDECE9", roughness: 0.7, metallic: 0 },
  ceil_slats_wood: { id: "ceil_slats_wood", category: "wall", color: "#B5874E", roughness: 0.6, metallic: 0 },
  ceil_slats_black: { id: "ceil_slats_black", category: "wall", color: "#2A2C2E", roughness: 0.7, metallic: 0 },
  ceil_concrete: { id: "ceil_concrete", category: "wall", color: "#AEABA6", roughness: 0.9, metallic: 0 },
  ceil_acoustic: { id: "ceil_acoustic", category: "wall", color: "#8A8F94", roughness: 1, metallic: 0 },
  ceil_loft_black: { id: "ceil_loft_black", category: "wall", color: "#222426", roughness: 0.9, metallic: 0 },
  ceil_coffered: { id: "ceil_coffered", category: "wall", color: "#EAE6DD", roughness: 0.75, metallic: 0 },
  ceil_beam_wood: { id: "ceil_beam_wood", category: "wall", color: "#6B4A30", roughness: 0.6, metallic: 0 },

  // ── Фасады (расширение) ──
  plaster_beige: { id: "plaster_beige", category: "facade", color: "#DAD0BC", roughness: 0.8, metallic: 0 },
  plaster_gray: { id: "plaster_gray", category: "facade", color: "#A6A29B", roughness: 0.8, metallic: 0 },
  plaster_terra: { id: "plaster_terra", category: "facade", color: "#B4642E", roughness: 0.8, metallic: 0 },
  plaster_graphite: { id: "plaster_graphite", category: "facade", color: "#44474C", roughness: 0.8, metallic: 0 },
  plaster_yellow: { id: "plaster_yellow", category: "facade", color: "#D7B25A", roughness: 0.8, metallic: 0 },
  clinker_gray: { id: "clinker_gray", category: "facade", color: "#7A756E", roughness: 0.8, metallic: 0 },
  clinker_brown: { id: "clinker_brown", category: "facade", color: "#6B4030", roughness: 0.8, metallic: 0 },
  brick_facade: { id: "brick_facade", category: "facade", color: "#A85838", roughness: 0.85, metallic: 0 },
  brick_facade_white: { id: "brick_facade_white", category: "facade", color: "#E2DDD3", roughness: 0.85, metallic: 0 },
  stone_facade: { id: "stone_facade", category: "facade", color: "#857F76", roughness: 0.9, metallic: 0 },
  travertine: { id: "travertine", category: "facade", color: "#D6C8AC", roughness: 0.7, metallic: 0 },
  composite_dark: { id: "composite_dark", category: "facade", color: "#33363B", roughness: 0.5, metallic: 0.3 },
  composite_wood: { id: "composite_wood", category: "facade", color: "#9A6A3A", roughness: 0.55, metallic: 0.2 },
  composite_white: { id: "composite_white", category: "facade", color: "#E6E6E4", roughness: 0.5, metallic: 0.3 },
  facade_metal: { id: "facade_metal", category: "facade", color: "#9CA3AB", roughness: 0.4, metallic: 0.7 },
  facade_metal_dark: { id: "facade_metal_dark", category: "facade", color: "#3F4347", roughness: 0.4, metallic: 0.7 },
  facade_panel_white: { id: "facade_panel_white", category: "facade", color: "#E8E8E6", roughness: 0.6, metallic: 0.2 },
  facade_panel_beige: { id: "facade_panel_beige", category: "facade", color: "#D2C7B2", roughness: 0.6, metallic: 0.2 },
  facade_panel_graphite: { id: "facade_panel_graphite", category: "facade", color: "#3A3D42", roughness: 0.6, metallic: 0.2 },
  facade_panel_terra: { id: "facade_panel_terra", category: "facade", color: "#A6552E", roughness: 0.6, metallic: 0.2 },
  facade_granite_vent: { id: "facade_granite_vent", category: "facade", color: "#6E7278", roughness: 0.45, metallic: 0.1 },
  facade_wood_dark: { id: "facade_wood_dark", category: "facade", color: "#5A4230", roughness: 0.7, metallic: 0 },

  // ── Кровля (расширение) ──
  metal_roof_graphite: { id: "metal_roof_graphite", category: "roof", color: "#33363B", roughness: 0.5, metallic: 0.6 },
  metal_roof_red: { id: "metal_roof_red", category: "roof", color: "#9C2E2E", roughness: 0.5, metallic: 0.6 },
  metal_roof_brown: { id: "metal_roof_brown", category: "roof", color: "#5A3A28", roughness: 0.5, metallic: 0.6 },
  metal_roof_green: { id: "metal_roof_green", category: "roof", color: "#2F5E3F", roughness: 0.5, metallic: 0.6 },
  metal_roof_blue: { id: "metal_roof_blue", category: "roof", color: "#2B4A6E", roughness: 0.5, metallic: 0.6 },
  profile_sheet: { id: "profile_sheet", category: "roof", color: "#5C6066", roughness: 0.55, metallic: 0.6 },
  profile_sheet_red: { id: "profile_sheet_red", category: "roof", color: "#8C2E2E", roughness: 0.55, metallic: 0.6 },
  soft_roof: { id: "soft_roof", category: "roof", color: "#3A3D42", roughness: 0.85, metallic: 0 },
  soft_roof_brown: { id: "soft_roof_brown", category: "roof", color: "#4A3528", roughness: 0.85, metallic: 0 },
  soft_roof_green: { id: "soft_roof_green", category: "roof", color: "#2E4A33", roughness: 0.85, metallic: 0 },
  ceramic_roof_red: { id: "ceramic_roof_red", category: "roof", color: "#A6432E", roughness: 0.65, metallic: 0.1 },
  ceramic_roof_brown: { id: "ceramic_roof_brown", category: "roof", color: "#6B3A28", roughness: 0.65, metallic: 0.1 },
  seam_roof: { id: "seam_roof", category: "roof", color: "#6E7278", roughness: 0.45, metallic: 0.7 },
  seam_roof_dark: { id: "seam_roof_dark", category: "roof", color: "#3A3D42", roughness: 0.45, metallic: 0.7 },
  copper_roof: { id: "copper_roof", category: "roof", color: "#7A9A6E", roughness: 0.5, metallic: 0.7 },
  slate_roof: { id: "slate_roof", category: "roof", color: "#363A3F", roughness: 0.7, metallic: 0.05 },
}

export const DEFAULT_FACADE = "plaster_white"
export const DEFAULT_FLOOR = "laminate"
export const DEFAULT_WALL = "block"
export const DEFAULT_ROOF = "metal_roof"

// Дизайн-токены интерфейса (§5.1) — дублируются в CSS-переменных globals.css.
export const TOKENS = {
  background: "#070A12",
  panel: "rgba(15, 23, 42, 0.82)",
  panelBorder: "rgba(148, 163, 184, 0.2)",
  accent: "#38BDF8",
  accent2: "#A78BFA",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  text: "#E5E7EB",
  muted: "#94A3B8",
} as const

export type PremiseStatus = "free" | "occupied" | "booked" | "debt"

export const STATUS_COLOR: Record<PremiseStatus, string> = {
  free: "#22C55E",
  occupied: "#94A3B8",
  booked: "#F59E0B",
  debt: "#EF4444",
}

// Подписи статуса помещения — в словаре (adminBuilder.premiseStatus): ключ
// совпадает со статусом, здесь остаётся только цвет.

/** Ключ подписи материала в словаре — он же его id. */
export type MaterialNameKey = keyof Messages["adminBuilder"]["materials"]

/**
 * Ключ подписи по id материала. Незнакомый id (старая модель, ручная правка
 * JSON) отдаёт «Бетон» — тот же запасной материал, что и у движка.
 */
export function materialNameKey(id: string | null | undefined): MaterialNameKey {
  return id && id in MATERIALS ? (id as MaterialNameKey) : "concrete"
}
