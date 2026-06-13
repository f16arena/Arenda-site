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

  // ── Полы (расширение) ──
  laminate_light: { id: "laminate_light", name: "Ламинат светл.", category: "floor", color: "#D8C49A", roughness: 0.6, metallic: 0 },
  laminate_dark: { id: "laminate_dark", name: "Ламинат тёмн.", category: "floor", color: "#5C4530", roughness: 0.6, metallic: 0 },
  laminate_gray: { id: "laminate_gray", name: "Ламинат сер.", category: "floor", color: "#9A958E", roughness: 0.6, metallic: 0 },
  parquet_herringbone: { id: "parquet_herringbone", name: "Паркет ёлочка", category: "floor", color: "#B5803F", roughness: 0.55, metallic: 0 },
  parquet_deck: { id: "parquet_deck", name: "Паркет палубный", category: "floor", color: "#C29A5E", roughness: 0.55, metallic: 0 },
  ash_floor: { id: "ash_floor", name: "Ясень", category: "floor", color: "#D6C2A0", roughness: 0.6, metallic: 0 },
  walnut_floor: { id: "walnut_floor", name: "Орех", category: "floor", color: "#6B4A30", roughness: 0.55, metallic: 0 },
  tile_white: { id: "tile_white", name: "Плитка бел.", category: "floor", color: "#F4F5F7", roughness: 0.35, metallic: 0 },
  tile_gray: { id: "tile_gray", name: "Плитка сер.", category: "floor", color: "#B0B4BA", roughness: 0.35, metallic: 0 },
  tile_beige: { id: "tile_beige", name: "Плитка беж.", category: "floor", color: "#DCD2C0", roughness: 0.35, metallic: 0 },
  tile_black: { id: "tile_black", name: "Плитка чёрн.", category: "floor", color: "#1F2123", roughness: 0.35, metallic: 0 },
  granite_dark: { id: "granite_dark", name: "Керамогранит тёмн.", category: "floor", color: "#3A3D42", roughness: 0.4, metallic: 0 },
  granite_beige: { id: "granite_beige", name: "Керамогранит беж.", category: "floor", color: "#CBBFA8", roughness: 0.4, metallic: 0 },
  marble_white: { id: "marble_white", name: "Мрамор бел.", category: "floor", color: "#F1F0EC", roughness: 0.2, metallic: 0.05 },
  marble_black: { id: "marble_black", name: "Мрамор чёрн.", category: "floor", color: "#26282B", roughness: 0.2, metallic: 0.05 },
  marble_emperador: { id: "marble_emperador", name: "Мрамор кор.", category: "floor", color: "#5A4534", roughness: 0.22, metallic: 0.05 },
  concrete_polished: { id: "concrete_polished", name: "Бетон полир.", category: "floor", color: "#A8A6A2", roughness: 0.3, metallic: 0.05 },
  carpet_beige: { id: "carpet_beige", name: "Ковролин беж.", category: "floor", color: "#C9BCA4", roughness: 1, metallic: 0 },
  carpet_green: { id: "carpet_green", name: "Ковролин зел.", category: "floor", color: "#4A6B52", roughness: 1, metallic: 0 },
  carpet_red: { id: "carpet_red", name: "Ковролин красн.", category: "floor", color: "#8A3A3A", roughness: 1, metallic: 0 },
  carpet_dark: { id: "carpet_dark", name: "Ковролин тёмн.", category: "floor", color: "#33363B", roughness: 1, metallic: 0 },
  vinyl_wood: { id: "vinyl_wood", name: "Винил под дерево", category: "floor", color: "#B89368", roughness: 0.65, metallic: 0 },
  vinyl_stone: { id: "vinyl_stone", name: "Винил под камень", category: "floor", color: "#9B9690", roughness: 0.65, metallic: 0 },
  cork: { id: "cork", name: "Пробка", category: "floor", color: "#C68C4E", roughness: 0.85, metallic: 0 },
  epoxy_gray: { id: "epoxy_gray", name: "Наливной сер.", category: "floor", color: "#8E8C88", roughness: 0.3, metallic: 0.1 },
  epoxy_blue: { id: "epoxy_blue", name: "Наливной син.", category: "floor", color: "#3C5A78", roughness: 0.3, metallic: 0.1 },
  checker_bw: { id: "checker_bw", name: "Шахматка ч/б", category: "floor", color: "#E8E8E8", roughness: 0.35, metallic: 0 },
  painted_board: { id: "painted_board", name: "Доска крашен.", category: "floor", color: "#C7CBC4", roughness: 0.7, metallic: 0 },
  terrazzo_dark: { id: "terrazzo_dark", name: "Терраццо тёмн.", category: "floor", color: "#3D3A38", roughness: 0.4, metallic: 0 },
  rubber_floor: { id: "rubber_floor", name: "Резиновое покр.", category: "floor", color: "#4A4D52", roughness: 0.9, metallic: 0 },

  // ── Стены (расширение) ──
  paint_beige: { id: "paint_beige", name: "Краска беж.", category: "wall", color: "#DDD2BC", roughness: 0.85, metallic: 0 },
  paint_yellow: { id: "paint_yellow", name: "Краска жёлт.", category: "wall", color: "#E3C04C", roughness: 0.85, metallic: 0 },
  paint_rose: { id: "paint_rose", name: "Краска роз.", category: "wall", color: "#D89C9C", roughness: 0.85, metallic: 0 },
  paint_mint: { id: "paint_mint", name: "Краска мятн.", category: "wall", color: "#A7CFBF", roughness: 0.85, metallic: 0 },
  paint_graphite: { id: "paint_graphite", name: "Краска графит", category: "wall", color: "#3A3D42", roughness: 0.85, metallic: 0 },
  paint_lavender: { id: "paint_lavender", name: "Краска лаванд.", category: "wall", color: "#B6A9D6", roughness: 0.85, metallic: 0 },
  wallpaper_floral: { id: "wallpaper_floral", name: "Обои цветочн.", category: "wall", color: "#D9CBB8", roughness: 0.8, metallic: 0 },
  wallpaper_stripe: { id: "wallpaper_stripe", name: "Обои в полоску", category: "wall", color: "#CBC6BB", roughness: 0.8, metallic: 0 },
  wallpaper_gray: { id: "wallpaper_gray", name: "Обои сер.", category: "wall", color: "#A6A29B", roughness: 0.8, metallic: 0 },
  wallpaper_blue: { id: "wallpaper_blue", name: "Обои син.", category: "wall", color: "#7C96B4", roughness: 0.8, metallic: 0 },
  wallpaper_dark: { id: "wallpaper_dark", name: "Обои тёмн.", category: "wall", color: "#3F4147", roughness: 0.8, metallic: 0 },
  venetian: { id: "venetian", name: "Венецианка", category: "wall", color: "#D8CEBD", roughness: 0.45, metallic: 0.05 },
  decor_plaster: { id: "decor_plaster", name: "Декор. штукатурка", category: "wall", color: "#CFC8BC", roughness: 0.75, metallic: 0 },
  brick_white: { id: "brick_white", name: "Кирпич бел.", category: "wall", color: "#E6E2DA", roughness: 0.9, metallic: 0 },
  brick_red: { id: "brick_red", name: "Кирпич красн.", category: "wall", color: "#A64A2E", roughness: 0.9, metallic: 0 },
  brick_gray: { id: "brick_gray", name: "Кирпич сер.", category: "wall", color: "#8A8680", roughness: 0.9, metallic: 0 },
  wood_panel_light: { id: "wood_panel_light", name: "Панели дерево светл.", category: "wall", color: "#C9A879", roughness: 0.6, metallic: 0 },
  wood_panel_dark: { id: "wood_panel_dark", name: "Панели дерево тёмн.", category: "wall", color: "#5A4230", roughness: 0.6, metallic: 0 },
  panel_3d: { id: "panel_3d", name: "3D-панели", category: "wall", color: "#E8E4DC", roughness: 0.7, metallic: 0 },
  tile_subway: { id: "tile_subway", name: "Плитка кабанчик", category: "wall", color: "#F0F1F2", roughness: 0.3, metallic: 0 },
  tile_subway_green: { id: "tile_subway_green", name: "Кабанчик зел.", category: "wall", color: "#4F7A66", roughness: 0.3, metallic: 0 },
  green_wall: { id: "green_wall", name: "Зелёная стена", category: "wall", color: "#3F7A47", roughness: 0.95, metallic: 0 },
  microcement: { id: "microcement", name: "Микроцемент", category: "wall", color: "#B9B4AC", roughness: 0.6, metallic: 0 },
  stone_slate: { id: "stone_slate", name: "Сланец", category: "wall", color: "#4A4E52", roughness: 0.9, metallic: 0 },
  mirror_wall: { id: "mirror_wall", name: "Зеркало", category: "wall", color: "#C9D6DC", roughness: 0.05, metallic: 0.9 },
  felt_panel: { id: "felt_panel", name: "Войлочн. панели", category: "wall", color: "#7D7A74", roughness: 1, metallic: 0 },
  gypsum_board: { id: "gypsum_board", name: "Гипсокартон", category: "wall", color: "#EDEAE4", roughness: 0.85, metallic: 0 },
  marble_wall: { id: "marble_wall", name: "Мрамор стен.", category: "wall", color: "#ECEBE7", roughness: 0.25, metallic: 0.05 },
  concrete_raw: { id: "concrete_raw", name: "Бетон необраб.", category: "wall", color: "#A09C97", roughness: 0.95, metallic: 0 },
  brick_loft_dark: { id: "brick_loft_dark", name: "Кирпич лофт тёмн.", category: "wall", color: "#4A3A30", roughness: 0.9, metallic: 0 },
  cork_wall: { id: "cork_wall", name: "Пробка стен.", category: "wall", color: "#C08A4E", roughness: 0.85, metallic: 0 },
  paint_black: { id: "paint_black", name: "Краска чёрн.", category: "wall", color: "#26282B", roughness: 0.85, metallic: 0 },
  paint_olive: { id: "paint_olive", name: "Краска олив.", category: "wall", color: "#6E7244", roughness: 0.85, metallic: 0 },
  paint_navy: { id: "paint_navy", name: "Краска тёмно-син.", category: "wall", color: "#28385A", roughness: 0.85, metallic: 0 },

  // ── Потолки (id ceil_*, category "wall") ──
  ceil_white: { id: "ceil_white", name: "Потолок бел.", category: "wall", color: "#F7F7F5", roughness: 0.85, metallic: 0 },
  ceil_stretch_gloss: { id: "ceil_stretch_gloss", name: "Натяжной глянец", category: "wall", color: "#EFF2F4", roughness: 0.15, metallic: 0.05 },
  ceil_stretch_matte: { id: "ceil_stretch_matte", name: "Натяжной мат", category: "wall", color: "#F2F1EE", roughness: 0.8, metallic: 0 },
  ceil_stretch_black: { id: "ceil_stretch_black", name: "Натяжной чёрн.", category: "wall", color: "#1E2022", roughness: 0.2, metallic: 0.05 },
  ceil_armstrong: { id: "ceil_armstrong", name: "Армстронг", category: "wall", color: "#E8E8E4", roughness: 0.9, metallic: 0 },
  ceil_slats_white: { id: "ceil_slats_white", name: "Рейки бел.", category: "wall", color: "#EDECE9", roughness: 0.7, metallic: 0 },
  ceil_slats_wood: { id: "ceil_slats_wood", name: "Рейки дерево", category: "wall", color: "#B5874E", roughness: 0.6, metallic: 0 },
  ceil_slats_black: { id: "ceil_slats_black", name: "Рейки чёрн.", category: "wall", color: "#2A2C2E", roughness: 0.7, metallic: 0 },
  ceil_concrete: { id: "ceil_concrete", name: "Потолок бетон", category: "wall", color: "#AEABA6", roughness: 0.9, metallic: 0 },
  ceil_acoustic: { id: "ceil_acoustic", name: "Акустич. панели", category: "wall", color: "#8A8F94", roughness: 1, metallic: 0 },
  ceil_loft_black: { id: "ceil_loft_black", name: "Потолок лофт чёрн.", category: "wall", color: "#222426", roughness: 0.9, metallic: 0 },
  ceil_coffered: { id: "ceil_coffered", name: "Кессонный", category: "wall", color: "#EAE6DD", roughness: 0.75, metallic: 0 },
  ceil_beam_wood: { id: "ceil_beam_wood", name: "Балки дерево", category: "wall", color: "#6B4A30", roughness: 0.6, metallic: 0 },

  // ── Фасады (расширение) ──
  plaster_beige: { id: "plaster_beige", name: "Штукатурка беж.", category: "facade", color: "#DAD0BC", roughness: 0.8, metallic: 0 },
  plaster_gray: { id: "plaster_gray", name: "Штукатурка сер.", category: "facade", color: "#A6A29B", roughness: 0.8, metallic: 0 },
  plaster_terra: { id: "plaster_terra", name: "Штукатурка терракот", category: "facade", color: "#B4642E", roughness: 0.8, metallic: 0 },
  plaster_graphite: { id: "plaster_graphite", name: "Штукатурка графит", category: "facade", color: "#44474C", roughness: 0.8, metallic: 0 },
  plaster_yellow: { id: "plaster_yellow", name: "Штукатурка охра", category: "facade", color: "#D7B25A", roughness: 0.8, metallic: 0 },
  clinker_gray: { id: "clinker_gray", name: "Клинкер сер.", category: "facade", color: "#7A756E", roughness: 0.8, metallic: 0 },
  clinker_brown: { id: "clinker_brown", name: "Клинкер кор.", category: "facade", color: "#6B4030", roughness: 0.8, metallic: 0 },
  brick_facade: { id: "brick_facade", name: "Кирпич фасадный", category: "facade", color: "#A85838", roughness: 0.85, metallic: 0 },
  brick_facade_white: { id: "brick_facade_white", name: "Кирпич фасад. бел.", category: "facade", color: "#E2DDD3", roughness: 0.85, metallic: 0 },
  stone_facade: { id: "stone_facade", name: "Камень фасад", category: "facade", color: "#857F76", roughness: 0.9, metallic: 0 },
  travertine: { id: "travertine", name: "Травертин", category: "facade", color: "#D6C8AC", roughness: 0.7, metallic: 0 },
  composite_dark: { id: "composite_dark", name: "Композит тёмн.", category: "facade", color: "#33363B", roughness: 0.5, metallic: 0.3 },
  composite_wood: { id: "composite_wood", name: "Композит дерево", category: "facade", color: "#9A6A3A", roughness: 0.55, metallic: 0.2 },
  composite_white: { id: "composite_white", name: "Композит бел.", category: "facade", color: "#E6E6E4", roughness: 0.5, metallic: 0.3 },
  facade_metal: { id: "facade_metal", name: "Металл фасад", category: "facade", color: "#9CA3AB", roughness: 0.4, metallic: 0.7 },
  facade_metal_dark: { id: "facade_metal_dark", name: "Металл тёмн.", category: "facade", color: "#3F4347", roughness: 0.4, metallic: 0.7 },
  facade_panel_white: { id: "facade_panel_white", name: "Фасад. панель бел.", category: "facade", color: "#E8E8E6", roughness: 0.6, metallic: 0.2 },
  facade_panel_beige: { id: "facade_panel_beige", name: "Фасад. панель беж.", category: "facade", color: "#D2C7B2", roughness: 0.6, metallic: 0.2 },
  facade_panel_graphite: { id: "facade_panel_graphite", name: "Фасад. панель графит", category: "facade", color: "#3A3D42", roughness: 0.6, metallic: 0.2 },
  facade_panel_terra: { id: "facade_panel_terra", name: "Фасад. панель терракот", category: "facade", color: "#A6552E", roughness: 0.6, metallic: 0.2 },
  facade_granite_vent: { id: "facade_granite_vent", name: "Керамогранит вентил.", category: "facade", color: "#6E7278", roughness: 0.45, metallic: 0.1 },
  facade_wood_dark: { id: "facade_wood_dark", name: "Дерево фасад тёмн.", category: "facade", color: "#5A4230", roughness: 0.7, metallic: 0 },

  // ── Кровля (расширение) ──
  metal_roof_graphite: { id: "metal_roof_graphite", name: "Металлочерепица графит", category: "roof", color: "#33363B", roughness: 0.5, metallic: 0.6 },
  metal_roof_red: { id: "metal_roof_red", name: "Металлочерепица красн.", category: "roof", color: "#9C2E2E", roughness: 0.5, metallic: 0.6 },
  metal_roof_brown: { id: "metal_roof_brown", name: "Металлочерепица кор.", category: "roof", color: "#5A3A28", roughness: 0.5, metallic: 0.6 },
  metal_roof_green: { id: "metal_roof_green", name: "Металлочерепица зел.", category: "roof", color: "#2F5E3F", roughness: 0.5, metallic: 0.6 },
  metal_roof_blue: { id: "metal_roof_blue", name: "Металлочерепица син.", category: "roof", color: "#2B4A6E", roughness: 0.5, metallic: 0.6 },
  profile_sheet: { id: "profile_sheet", name: "Профлист", category: "roof", color: "#5C6066", roughness: 0.55, metallic: 0.6 },
  profile_sheet_red: { id: "profile_sheet_red", name: "Профлист красн.", category: "roof", color: "#8C2E2E", roughness: 0.55, metallic: 0.6 },
  soft_roof: { id: "soft_roof", name: "Мягкая кровля", category: "roof", color: "#3A3D42", roughness: 0.85, metallic: 0 },
  soft_roof_brown: { id: "soft_roof_brown", name: "Мягкая кровля кор.", category: "roof", color: "#4A3528", roughness: 0.85, metallic: 0 },
  soft_roof_green: { id: "soft_roof_green", name: "Мягкая кровля зел.", category: "roof", color: "#2E4A33", roughness: 0.85, metallic: 0 },
  ceramic_roof_red: { id: "ceramic_roof_red", name: "Керамич. черепица красн.", category: "roof", color: "#A6432E", roughness: 0.65, metallic: 0.1 },
  ceramic_roof_brown: { id: "ceramic_roof_brown", name: "Керамич. черепица кор.", category: "roof", color: "#6B3A28", roughness: 0.65, metallic: 0.1 },
  seam_roof: { id: "seam_roof", name: "Фальцевая кровля", category: "roof", color: "#6E7278", roughness: 0.45, metallic: 0.7 },
  seam_roof_dark: { id: "seam_roof_dark", name: "Фальц тёмн.", category: "roof", color: "#3A3D42", roughness: 0.45, metallic: 0.7 },
  copper_roof: { id: "copper_roof", name: "Медная кровля", category: "roof", color: "#7A9A6E", roughness: 0.5, metallic: 0.7 },
  slate_roof: { id: "slate_roof", name: "Сланцевая кровля", category: "roof", color: "#363A3F", roughness: 0.7, metallic: 0.05 },
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
