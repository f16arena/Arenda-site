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
  {
    id: "premium_office",
    label: "Премиум-офис",
    floorMaterial: "parquet",
    objects: [
      { assetId: "meeting_table", dx: 0, dz: 0 },
      { assetId: "lounge_chair", dx: -2000, dz: 1500, rot: 180 },
      { assetId: "lounge_chair", dx: 2000, dz: 1500, rot: 180 },
      { assetId: "sideboard", dx: 0, dz: -2600 },
      { assetId: "plant_big", dx: -2600, dz: -2000 },
      { assetId: "ceiling_light", dx: 0, dz: 0 },
      { assetId: "painting", dx: 0, dz: -2900 },
    ],
  },
  {
    id: "loft",
    label: "Лофт",
    floorMaterial: "concrete_polished",
    objects: [
      { assetId: "sofa", dx: 0, dz: 1500, rot: 180 },
      { assetId: "coffee_table", dx: 0, dz: 400 },
      { assetId: "tv", dx: 0, dz: -2800 },
      { assetId: "bookshelf", dx: -2600, dz: 0 },
      { assetId: "floor_lamp", dx: 2200, dz: 1200 },
      { assetId: "rug", dx: 0, dz: 800 },
    ],
  },
  {
    id: "minimal",
    label: "Минимал",
    floorMaterial: "laminate_light",
    objects: [
      { assetId: "desk", dx: 0, dz: -600 },
      { assetId: "chair", dx: 0, dz: 200, rot: 180 },
      { assetId: "plant_pot", dx: 2000, dz: -2000 },
      { assetId: "ceiling_light", dx: 0, dz: 0 },
    ],
  },
  {
    id: "apartment",
    label: "Квартира",
    floorMaterial: "parquet_deck",
    objects: [
      { assetId: "sofa", dx: -1500, dz: 1200, rot: 180 },
      { assetId: "coffee_table", dx: -1500, dz: 400 },
      { assetId: "tv_stand", dx: -1500, dz: -2400 },
      { assetId: "dining_table", dx: 2000, dz: 0 },
      { assetId: "cafe_chair", dx: 2000, dz: 800, rot: 180 },
      { assetId: "cafe_chair", dx: 2000, dz: -800 },
      { assetId: "wardrobe", dx: 2600, dz: -2400 },
    ],
  },
  {
    id: "coworking",
    label: "Коворкинг",
    floorMaterial: "carpet_gray",
    objects: [
      { assetId: "desk", dx: 0, dz: 0 },
      { assetId: "chair", dx: -800, dz: 800, rot: 180 },
      { assetId: "chair", dx: 800, dz: 800, rot: 180 },
      { assetId: "whiteboard", dx: 0, dz: -2800 },
      { assetId: "plant_big", dx: -2600, dz: -2000 },
      { assetId: "ceiling_light", dx: 0, dz: 0 },
    ],
  },
  {
    id: "showroom",
    label: "Шоурум",
    floorMaterial: "tile_white",
    objects: [
      { assetId: "display_case", dx: -2000, dz: 0 },
      { assetId: "display_case", dx: 2000, dz: 0 },
      { assetId: "display_case", dx: 0, dz: 1000 },
      { assetId: "reception", dx: 0, dz: -2600 },
      { assetId: "spot", dx: 0, dz: 0 },
    ],
  },
  {
    id: "classroom",
    label: "Класс",
    floorMaterial: "vinyl",
    objects: [
      { assetId: "whiteboard", dx: 0, dz: -2800 },
      { assetId: "desk", dx: -1500, dz: 0 },
      { assetId: "desk", dx: 1500, dz: 0 },
      { assetId: "chair", dx: -1500, dz: 800, rot: 180 },
      { assetId: "chair", dx: 1500, dz: 800, rot: 180 },
      { assetId: "ceiling_light", dx: 0, dz: 0 },
    ],
  },
  { id: "empty", label: "Пусто", floorMaterial: "concrete", objects: [] },
]
