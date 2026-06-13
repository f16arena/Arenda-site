// ADR: Пресеты проёмов (Фаза 2.0) — типы дверей/окон с размерами по умолчанию.
// variant хранится в Opening; wall-builder рисует геометрию по variant, ToolOptions
// и PropertyPanel дают выбор. Размеры можно переопределять у выбранного проёма.

export interface OpeningPreset {
  variant: string
  label: string
  width: number // мм
  height: number
  sill: number
}

export const DOOR_PRESETS: OpeningPreset[] = [
  { variant: "interior", label: "Межкомнатная", width: 800, height: 2050, sill: 0 },
  { variant: "single", label: "Входная", width: 1000, height: 2100, sill: 0 },
  { variant: "double", label: "Двустворчатая", width: 1600, height: 2200, sill: 0 },
  { variant: "sliding", label: "Раздвижная", width: 1800, height: 2200, sill: 0 },
  { variant: "garage", label: "Гаражная", width: 3000, height: 2600, sill: 0 },
]

export const WINDOW_PRESETS: OpeningPreset[] = [
  { variant: "standard", label: "Обычное", width: 1200, height: 1400, sill: 900 },
  { variant: "panoramic", label: "Панорамное", width: 2600, height: 2100, sill: 200 },
  { variant: "small", label: "Маленькое", width: 700, height: 700, sill: 1300 },
  { variant: "wide", label: "Широкое", width: 2000, height: 1300, sill: 850 },
]

export function presetsFor(type: "door" | "window"): OpeningPreset[] {
  return type === "door" ? DOOR_PRESETS : WINDOW_PRESETS
}

export function findPreset(type: "door" | "window", variant: string): OpeningPreset {
  const list = presetsFor(type)
  return list.find((p) => p.variant === variant) ?? list[0]
}
