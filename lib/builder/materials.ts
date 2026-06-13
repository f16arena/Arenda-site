// ADR: Чистые определения материалов (id, цвет, PBR-параметры) и дизайн-токены (§5.1).
// Без Babylon — движок (engine/material-registry) создаёт из этих DTO PBR-материалы и
// кэширует. Замена на текстуры/GLB-материалы = правка данных, без изменения движка.

export interface MaterialDef {
  id: string
  name: string
  category: "wall" | "floor" | "facade" | "roof" | "ground" | "glass" | "object"
  color: string // hex
  roughness: number
  metallic: number
  opacity?: number
  emissive?: string
}

export const MATERIALS: Record<string, MaterialDef> = {
  grass: { id: "grass", name: "Газон", category: "ground", color: "#5BA64C", roughness: 1, metallic: 0 },
  asphalt: { id: "asphalt", name: "Асфальт", category: "ground", color: "#3F3F46", roughness: 0.95, metallic: 0 },
  paving: { id: "paving", name: "Брусчатка", category: "ground", color: "#9CA3AF", roughness: 0.9, metallic: 0 },
  concrete: { id: "concrete", name: "Бетон", category: "wall", color: "#B8B5B2", roughness: 0.85, metallic: 0 },
  plaster_white: { id: "plaster_white", name: "Штукатурка", category: "facade", color: "#EDEAE3", roughness: 0.8, metallic: 0 },
  brick: { id: "brick", name: "Кирпич", category: "facade", color: "#B4642E", roughness: 0.9, metallic: 0 },
  block: { id: "block", name: "Газоблок", category: "wall", color: "#D8D8D2", roughness: 0.85, metallic: 0 },
  glass: { id: "glass", name: "Стекло", category: "glass", color: "#9FD3F0", roughness: 0.1, metallic: 0.1, opacity: 0.35 },
  laminate: { id: "laminate", name: "Ламинат", category: "floor", color: "#C9A86A", roughness: 0.6, metallic: 0 },
  tile: { id: "tile", name: "Плитка", category: "floor", color: "#E2E8F0", roughness: 0.4, metallic: 0 },
  metal_roof: { id: "metal_roof", name: "Металлочерепица", category: "roof", color: "#374151", roughness: 0.5, metallic: 0.6 },
  slab: { id: "slab", name: "Перекрытие", category: "floor", color: "#E7E5E4", roughness: 0.9, metallic: 0 },

  // ── Полы ──
  parquet: { id: "parquet", name: "Паркет", category: "floor", color: "#B07A43", roughness: 0.55, metallic: 0 },
  oak_floor: { id: "oak_floor", name: "Дуб", category: "floor", color: "#C8A06A", roughness: 0.6, metallic: 0 },
  wenge_floor: { id: "wenge_floor", name: "Венге", category: "floor", color: "#5A4632", roughness: 0.55, metallic: 0 },
  marble: { id: "marble", name: "Мрамор", category: "floor", color: "#ECECEC", roughness: 0.25, metallic: 0.05 },
  granite: { id: "granite", name: "Керамогранит", category: "floor", color: "#8A8F98", roughness: 0.4, metallic: 0 },
  carpet_gray: { id: "carpet_gray", name: "Ковролин сер.", category: "floor", color: "#6B7280", roughness: 1, metallic: 0 },
  carpet_blue: { id: "carpet_blue", name: "Ковролин син.", category: "floor", color: "#3B5374", roughness: 1, metallic: 0 },
  vinyl: { id: "vinyl", name: "Винил", category: "floor", color: "#A8A29E", roughness: 0.7, metallic: 0 },
  epoxy: { id: "epoxy", name: "Наливной", category: "floor", color: "#D6D3D1", roughness: 0.3, metallic: 0.1 },
  checker: { id: "checker", name: "Шахматный", category: "floor", color: "#1F2937", roughness: 0.35, metallic: 0 },
  terrazzo: { id: "terrazzo", name: "Терраццо", category: "floor", color: "#E5E1D8", roughness: 0.4, metallic: 0 },

  // ── Стены (отделка) ──
  paint_white: { id: "paint_white", name: "Краска бел.", category: "wall", color: "#F3F4F6", roughness: 0.85, metallic: 0 },
  paint_gray: { id: "paint_gray", name: "Краска сер.", category: "wall", color: "#9CA3AF", roughness: 0.85, metallic: 0 },
  paint_blue: { id: "paint_blue", name: "Краска син.", category: "wall", color: "#3B5374", roughness: 0.85, metallic: 0 },
  paint_green: { id: "paint_green", name: "Краска зел.", category: "wall", color: "#3F6F52", roughness: 0.85, metallic: 0 },
  paint_terra: { id: "paint_terra", name: "Терракот", category: "wall", color: "#B4642E", roughness: 0.85, metallic: 0 },
  wallpaper: { id: "wallpaper", name: "Обои", category: "wall", color: "#E7E0D6", roughness: 0.8, metallic: 0 },
  stone: { id: "stone", name: "Камень", category: "wall", color: "#7A756E", roughness: 0.95, metallic: 0 },
  wood_panel: { id: "wood_panel", name: "Панели дерево", category: "wall", color: "#9A6A3A", roughness: 0.6, metallic: 0 },
  loft: { id: "loft", name: "Лофт-бетон", category: "wall", color: "#8B8680", roughness: 0.9, metallic: 0 },

  // ── Фасады ──
  clinker: { id: "clinker", name: "Клинкер", category: "facade", color: "#9C4A2E", roughness: 0.8, metallic: 0 },
  composite: { id: "composite", name: "Композит", category: "facade", color: "#4B5563", roughness: 0.5, metallic: 0.3 },
  facade_panel: { id: "facade_panel", name: "Фасад. панель", category: "facade", color: "#94A3B8", roughness: 0.6, metallic: 0.2 },
  facade_wood: { id: "facade_wood", name: "Дерево фасад", category: "facade", color: "#A87B4A", roughness: 0.7, metallic: 0 },
  curtain_glass: { id: "curtain_glass", name: "Витраж", category: "glass", color: "#7FB7DC", roughness: 0.1, metallic: 0.2, opacity: 0.45 },

  // ── Кровля ──
  roof_red: { id: "roof_red", name: "Черепица красн.", category: "roof", color: "#9C2E2E", roughness: 0.6, metallic: 0.2 },
  roof_brown: { id: "roof_brown", name: "Черепица кор.", category: "roof", color: "#5A3A28", roughness: 0.6, metallic: 0.2 },
  roof_green: { id: "roof_green", name: "Кровля зел.", category: "roof", color: "#2F5E3F", roughness: 0.6, metallic: 0.2 },
  roof_membrane: { id: "roof_membrane", name: "Мембрана", category: "roof", color: "#3F3F46", roughness: 0.8, metallic: 0 },
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

export const STATUS_LABEL: Record<PremiseStatus, string> = {
  free: "Свободно",
  occupied: "Занято",
  booked: "Бронь",
  debt: "Долг",
}
