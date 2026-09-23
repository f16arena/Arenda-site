// ADR: Room Style Presets (§19) — стиль помещения одним действием: материал пола +
// набор объектов вокруг центра комнаты. Применяется командой одной undo-группой,
// всё остаётся редактируемым. Смещения dx/dz — в мм от центра комнаты.
//
// Подпись стиля — в словаре (adminBuilder.roomPresets), ключ совпадает с id.

import type { Messages } from "@/lib/i18n/messages"

/** Ключ подписи стиля в словаре (adminBuilder.roomPresets) — он же id стиля. */
export type RoomPresetKey = keyof Messages["adminBuilder"]["roomPresets"]

export interface PresetObject {
  assetId: string
  dx: number
  dz: number
  rot?: number
}

export interface RoomPreset {
  id: RoomPresetKey
  floorMaterial: string
  objects: PresetObject[]
}

export const ROOM_PRESETS: RoomPreset[] = [
  {
    id: "office",
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
  { id: "empty", floorMaterial: "concrete", objects: [] },
]
