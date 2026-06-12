// ADR: Demo-проект собирается ИСКЛЮЧИТЕЛЬНО через команды документа (§9.1) — это и
// первое впечатление, и интеграционный тест ядра. Никакой захардкоженной геометрии в
// обход системы: те же InsertWall/SetRoof/AddObject, что и в редакторе.

import { uid } from "@/core/id"
import type { BuilderDocument, Floor, Building, BuilderObject } from "@/types/builder"
import type { PremiseStatus } from "@/lib/builder/materials"
import {
  type Command,
  AddBuildingCommand,
  AddFloorCommand,
  InsertWallCommand,
  SetRoofCommand,
  AddObjectCommand,
  LinkPremiseCommand,
} from "@/core/document/commands"
import { emptyGraph, type WallDefaults } from "@/core/geometry/wall-graph"
import { detectRooms } from "@/core/geometry/room-detection"
import type { Vec2 } from "@/core/geometry/math"

const FLOOR_HEIGHT = 3500
const EXT: WallDefaults = { thickness: 300, height: FLOOR_HEIGHT, kind: "exterior" }
const INT: WallDefaults = { thickness: 150, height: FLOOR_HEIGHT, kind: "interior" }

// Статусы mock-помещений demo (premiseId → статус) для overlay.
export const DEMO_PREMISE_STATUS: Record<string, PremiseStatus> = {
  "demo-101": "free",
  "demo-102": "occupied",
  "demo-103": "booked",
  "demo-104": "debt",
}

function makeFloor(level: number): Floor {
  return {
    id: uid("f"),
    name: level === 0 ? "Цоколь" : `${level} этаж`,
    level,
    elevation: level * FLOOR_HEIGHT,
    height: FLOOR_HEIGHT,
    visible: true,
    locked: false,
    opacity: 1,
    wallGraph: emptyGraph(),
    openings: [],
    stairs: [],
    objects: [],
    premiseLinks: {},
    floorMaterialId: "laminate",
    roomMaterials: {},
  }
}

const p = (x: number, y: number): Vec2 => ({ x, y })

// Перегородки + периметр прямоугольного этажа 20×12 м, центрированного в (0,0).
function floorWalls(floorId: string): Command[] {
  const W = 10000 // полу-ширина
  const H = 6000 // полу-глубина
  const wall = (a: Vec2, b: Vec2, def: WallDefaults) => new InsertWallCommand(floorId, a, b, def)
  return [
    // периметр
    wall(p(-W, -H), p(W, -H), EXT),
    wall(p(W, -H), p(W, H), EXT),
    wall(p(W, H), p(-W, H), EXT),
    wall(p(-W, H), p(-W, -H), EXT),
    // перегородки → 6 комнат (2 вертикали + 1 горизонталь)
    wall(p(-3000, -H), p(-3000, H), INT),
    wall(p(4000, -H), p(4000, H), INT),
    wall(p(-W, 0), p(W, 0), INT),
  ]
}

function siteObject(assetId: string, x: number, z: number, rotationY = 0, scale = 1): BuilderObject {
  return { id: uid("o"), assetId, position: { x, y: 0, z }, rotationY, scale, attachTo: "terrain", locked: false }
}

export function buildDemoProject(): BuilderDocument {
  const building: Building = { id: uid("b"), name: "Demo Commercial", origin: { x: 0, y: 0 }, floors: [] }
  let doc: BuilderDocument = {
    id: uid("proj"),
    schemaVersion: 1,
    name: "Demo Building",
    site: { sizeX: 50000, sizeZ: 40000, groundMaterialId: "grass", objects: [], terrainRes: 64 },
    buildings: [],
  }
  const run = (cmd: Command) => {
    doc = cmd.apply(doc)
  }

  run(new AddBuildingCommand(building))

  const floors: Floor[] = []
  for (const level of [0, 1, 2, 3]) {
    const f = makeFloor(level)
    floors.push(f)
    run(new AddFloorCommand(building.id, f))
    for (const cmd of floorWalls(f.id)) run(cmd)
  }

  // Кровля на верхнем этаже — двускатная.
  const top = floors[floors.length - 1]
  run(new SetRoofCommand(top.id, { type: "gable", pitchDeg: 25, overhang: 600, thickness: 200, materialId: "metal_roof" }))

  // Привязка mock-помещений к первым комнатам цоколя — overlay статусов сразу виден.
  const ground = floors[0]
  const groundFloor = doc.buildings[0].floors.find((fl) => fl.id === ground.id)
  if (groundFloor) {
    const rooms = detectRooms(groundFloor.wallGraph)
    const premiseIds = ["demo-101", "demo-102", "demo-103", "demo-104"]
    rooms.slice(0, premiseIds.length).forEach((room, i) => {
      run(new LinkPremiseCommand(ground.id, room.id, premiseIds[i]))
    })
  }

  // Территория: деревья, фонари, парковка, скамейки (процедурные ассеты §9.4).
  const siteObjs: BuilderObject[] = [
    siteObject("tree", -18000, -14000),
    siteObject("tree", 17000, -15000),
    siteObject("spruce", -19000, 12000),
    siteObject("tree", 18000, 13000),
    siteObject("lamp", -12000, -9000),
    siteObject("lamp", 12000, -9000),
    siteObject("bench", 0, -9500),
    siteObject("parking", 0, 14000),
    siteObject("parking", 6000, 14000),
    siteObject("parking", -6000, 14000),
  ]
  for (const o of siteObjs) run(new AddObjectCommand({ site: true }, o))

  return doc
}
