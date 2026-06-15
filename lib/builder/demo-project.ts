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
  AddOpeningCommand,
  AddStairCommand,
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
    name: level <= 0 ? (level === 0 ? "Подвал" : `Подвал ${1 - level}`) : `${level} этаж`,
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

// Объект внутри здания: пол (мебель) либо потолок (светильник). Координаты — в плане этажа (мм).
function floorObject(
  assetId: string,
  x: number,
  z: number,
  rotationY = 0,
  attachTo: BuilderObject["attachTo"] = "floor",
  scale = 1,
): BuilderObject {
  return { id: uid("o"), assetId, position: { x, y: 0, z }, rotationY, scale, attachTo, locked: false }
}

// Пустой проект «с нуля»: одно здание + один пустой этаж (цоколь) без стен/объектов.
// Для кнопки «Очистить всё» — чистый холст, на котором сразу можно строить.
export function buildEmptyProject(): BuilderDocument {
  const building: Building = { id: uid("b"), name: "Новый проект", origin: { x: 0, y: 0 }, floors: [] }
  let doc: BuilderDocument = {
    id: uid("proj"),
    schemaVersion: 1,
    name: "Новый проект",
    site: { sizeX: 50000, sizeZ: 40000, groundMaterialId: "grass", objects: [], terrainRes: 64, water: [], paths: [], pavements: [] },
    buildings: [],
  }
  doc = new AddBuildingCommand(building).apply(doc)
  doc = new AddFloorCommand(building.id, makeFloor(0)).apply(doc)
  return doc
}

export function buildDemoProject(): BuilderDocument {
  const building: Building = { id: uid("b"), name: "Demo Commercial", origin: { x: 0, y: 0 }, floors: [] }
  let doc: BuilderDocument = {
    id: uid("proj"),
    schemaVersion: 1,
    name: "Demo Building",
    site: { sizeX: 50000, sizeZ: 40000, groundMaterialId: "grass", objects: [], terrainRes: 64, water: [], paths: [], pavements: [] },
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

  // ── Меблировка 1-го этажа (level 1): «как готовый уровень» ──────────────────
  // Контур центрирован: полуширина 10000, полуглубина 6000. Перегородки на x=-3000,
  // x=4000 и y=0 делят план на 6 зон. Все объекты — внутри контура, y=0.
  const firstFloor = floors.find((f) => f.level === 1)
  if (firstFloor) {
    const fid = firstFloor.id
    const furniture: BuilderObject[] = [
      // Входная зона (передняя кромка y=-H): ресепшен лицом в зал.
      floorObject("reception", -6500, -4200, 0),
      floorObject("plant_pot", -8800, -4800, 0),
      // Кабинет слева (зона x<-3000, y<0): два рабочих места desk+chair.
      floorObject("desk", -6500, -2200, Math.PI),
      floorObject("chair", -6500, -1300, 0),
      floorObject("desk", -4200, -2200, Math.PI),
      floorObject("chair", -4200, -1300, 0),
      floorObject("ceiling_light", -6500, -3000, 0, "ceiling"),
      // Переговорная/лаундж справа (зона x>4000, y<0): диван + столик + TV.
      floorObject("sofa", 7000, -3000, Math.PI),
      floorObject("coffee_table", 7000, -1800, 0),
      floorObject("tv", 7000, -5600, 0),
      floorObject("ceiling_light", 7000, -2500, 0, "ceiling"),
      // Центральная зона (зона -3000<x<4000, y<0): растение-акцент.
      floorObject("plant_pot", 500, -1500, 0),
      // Открытый офис сзади (y>0): рабочие места + общий свет.
      floorObject("desk", -6500, 3000, 0),
      floorObject("chair", -6500, 2100, Math.PI),
      floorObject("desk", 7000, 3000, 0),
      floorObject("chair", 7000, 2100, Math.PI),
      floorObject("ceiling_light", 0, 3000, 0, "ceiling"),
    ]
    for (const o of furniture) run(new AddObjectCommand({ floorId: fid }, o))
  }

  // ── Цоколь (level 0): игровая зона + склад ──────────────────────────────────
  const basement = floors.find((f) => f.level === 0)
  if (basement) {
    const bid = basement.id
    const basementObjs: BuilderObject[] = [
      // Игровые места (gaming_desk + gaming_chair) вдоль левой зоны.
      floorObject("gaming_desk", -6500, -3000, Math.PI),
      floorObject("gaming_chair", -6500, -2100, 0),
      floorObject("gaming_desk", -6500, 1000, 0),
      floorObject("gaming_chair", -6500, 1900, Math.PI),
      // Складские стеллажи в правой зоне.
      floorObject("rack", 7000, -3500, 0),
      floorObject("rack", 7000, -1500, 0),
      floorObject("rack", 7000, 3500, 0),
      floorObject("ceiling_light", -6500, -1000, 0, "ceiling"),
      floorObject("ceiling_light", 7000, 0, 0, "ceiling"),
    ]
    for (const o of basementObjs) run(new AddObjectCommand({ floorId: bid }, o))
  }

  // ── Окна на длинных наружных стенах надземных этажей (1-3) + входная дверь ───
  // Рёбра читаем из doc ПОСЛЕ построения стен. «Длинными» считаем наружные рёбра
  // длиннее 6000 мм (передние/задние грани 20 м; боковые 12 м тоже попадают).
  const aboveGround = floors.filter((f) => f.level >= 1)
  let entranceDoorPlaced = false
  for (const f of aboveGround) {
    const built = doc.buildings[0].floors.find((fl) => fl.id === f.id)
    if (!built) continue
    const g = built.wallGraph
    for (const edge of Object.values(g.edges)) {
      if (edge.kind !== "exterior") continue
      const na = g.nodes[edge.a]
      const nb = g.nodes[edge.b]
      if (!na || !nb) continue
      const len = Math.hypot(nb.x - na.x, nb.y - na.y)
      if (len < 6000) continue
      const mid = len / 2 // offset = расстояние от начала стены до центра проёма
      // Входная дверь — на одном переднем (y≈-H) ребре 1-го этажа.
      const isFrontEdge = Math.abs(na.y - (-6000)) < 1 && Math.abs(nb.y - (-6000)) < 1
      if (!entranceDoorPlaced && f.level === 1 && isFrontEdge) {
        run(
          new AddOpeningCommand(f.id, {
            id: uid("op"),
            wallId: edge.id,
            type: "door",
            variant: "single",
            width: 1000,
            height: 2100,
            sillHeight: 0,
            offset: mid,
          }),
        )
        entranceDoorPlaced = true
        continue
      }
      run(
        new AddOpeningCommand(f.id, {
          id: uid("op"),
          wallId: edge.id,
          type: "window",
          variant: "standard",
          width: 1200,
          height: 1400,
          sillHeight: 900,
          offset: mid,
        }),
      )
    }
  }

  // ── Лестница "u" между этажами: 0→1, 1→2, 2→3 (в углу плана) ─────────────────
  const byLevel = (lvl: number) => floors.find((f) => f.level === lvl)
  for (const [fromLvl, toLvl] of [[0, 1], [1, 2], [2, 3]] as const) {
    const from = byLevel(fromLvl)
    const to = byLevel(toLvl)
    if (!from || !to) continue
    run(
      new AddStairCommand(from.id, {
        id: uid("st"),
        shape: "u",
        fromFloorId: from.id,
        toFloorId: to.id,
        position: { x: -7000, y: -4000 },
        rotationDeg: 0,
        width: 1100,
        railing: true,
      }),
    )
  }

  // ── Пруд и пара деревьев рядом со зданием ───────────────────────────────────
  const landscaping: BuilderObject[] = [
    siteObject("pond", -15000, 6000, 0, 1),
    siteObject("tree", -12000, 3000),
    siteObject("tree", -16000, 1000),
  ]
  for (const o of landscaping) run(new AddObjectCommand({ site: true }, o))

  return doc
}
