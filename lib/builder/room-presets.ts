// ADR: Room Style Presets (§19) — стиль помещения одним действием: материал пола +
// набор объектов вокруг центра комнаты. Применяется командой одной undo-группой,
// всё остаётся редактируемым. Смещения dx/dz — в мм от центра комнаты.

export interface PresetObject {
  assetId: string
  dx: number
  dz: number
  rot?: number
}

export interface RoomPreset {
  id: string
  label: string
  floorMaterial: string
  objects: PresetObject[]
}

export const ROOM_PRESETS: RoomPreset[] = [
  {
    id: "office",
    label: "Офис",
    floorMaterial: "laminate",
    objects: [
      { assetId: "desk", dx: 0, dz: -600 },
      { assetId: "chair", dx: 0, dz: 200, rot: 180 },
      { assetId: "meeting_table", dx: 2200, dz: 0 },
      { assetId: "plant_pot", dx: -2200, dz: -1800 },
      { assetId: "ceiling_light", dx: 0, dz: 0 },
    ],
  },
  {
    id: "gaming",
    label: "Клуб",
    floorMaterial: "carpet_blue",
    objects: [
      { assetId: "gaming_desk", dx: -1600, dz: 0 },
      { assetId: "gaming_chair", dx: -1600, dz: 800, rot: 180 },
      { assetId: "gaming_desk", dx: 1600, dz: 0 },
      { assetId: "gaming_chair", dx: 1600, dz: 800, rot: 180 },
      { assetId: "led_strip", dx: 0, dz: 0 },
      { assetId: "reception", dx: 0, dz: -2600 },
    ],
  },
  {
    id: "cafe",
    label: "Кафе",
    floorMaterial: "parquet",
    objects: [
      { assetId: "cafe_table", dx: -1500, dz: 600 },
      { assetId: "cafe_chair", dx: -1500, dz: 1300, rot: 180 },
      { assetId: "cafe_table", dx: 1500, dz: 600 },
      { assetId: "cafe_chair", dx: 1500, dz: 1300, rot: 180 },
      { assetId: "bar_counter", dx: 0, dz: -2400 },
      { assetId: "coffee_machine", dx: 800, dz: -2400 },
    ],
  },
  {
    id: "retail",
    label: "Магазин",
    floorMaterial: "granite",
    objects: [
      { assetId: "rack", dx: -2000, dz: 0 },
      { assetId: "rack", dx: 2000, dz: 0 },
      { assetId: "display_case", dx: 0, dz: 1000 },
      { assetId: "reception", dx: 0, dz: -2400 },
    ],
  },
  { id: "empty", label: "Пусто", floorMaterial: "concrete", objects: [] },
]
