// Контур лестницы/лифта в плане (мм) без движка — для чертежей и редактора плана.

import { generateStair, stairRise, stairToWorld, type StairPlacement } from "@/core/geometry/stair-generator"

export function stairHoleWorld(stair: StairPlacement, floorHeight: number): { x: number; y: number }[] {
  const geo = generateStair(stair.shape, stairRise(stair, floorHeight), stair.width, stair.railing, stair.depth, stair.tread)
  return [
    stairToWorld(stair, geo.hole.minX, geo.hole.minZ),
    stairToWorld(stair, geo.hole.maxX, geo.hole.minZ),
    stairToWorld(stair, geo.hole.maxX, geo.hole.maxZ),
    stairToWorld(stair, geo.hole.minX, geo.hole.maxZ),
  ]
}
