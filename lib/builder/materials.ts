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
