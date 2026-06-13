// ADR: AI Mode (§10) — компиляция структурированного BuildingSpec (его отдаёт модель
// строго по json_schema) в BuilderDocument теми же командами документа, что и редактор.
// Никакой «магической» геометрии: спек → последовательность InsertWall/SetRoof/AddObject.

import { z } from "zod"
import { uid } from "@/core/id"
import type { BuilderDocument, Floor, Building, BuilderObject } from "@/types/builder"
import {
  type Command,
  AddBuildingCommand,
  AddFloorCommand,
  InsertWallCommand,
  SetRoofCommand,
  AddObjectCommand,
  AddOpeningCommand,
  AddStairCommand,
  findFloor,
} from "@/core/document/commands"
import { emptyGraph, type WallDefaults } from "@/core/geometry/wall-graph"
import type { Vec2 } from "@/core/geometry/math"
import { findPreset } from "@/lib/builder/openings"

// Валидация мягкая (без min/max — кламп делаем в buildDocFromSpec), т.к. Anthropic
// structured output не принимает minimum/maximum для integer.
export const BuildingSpecSchema = z.object({
  name: z.string(),
  floors: z.number(),
  widthM: z.number(),
  depthM: z.number(),
  cols: z.number(),
  rows: z.number(),
  facade: z.enum(["plaster_white", "brick", "concrete", "glass", "block"]),
  roof: z.enum(["flat", "gable"]),
  parking: z.number(),
  basement: z.boolean(),
})
export type BuildingSpec = z.infer<typeof BuildingSpecSchema>

// JSON-schema для Anthropic output_config (структурный вывод). Без minimum/maximum —
// диапазоны описаны в системном промпте, итог клампится в коде.
export const BUILDING_SPEC_JSONSCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "floors", "widthM", "depthM", "cols", "rows", "facade", "roof", "parking", "basement"],
  properties: {
    name: { type: "string" },
    floors: { type: "integer" },
    widthM: { type: "number" },
    depthM: { type: "number" },
    cols: { type: "integer" },
    rows: { type: "integer" },
    facade: { type: "string", enum: ["plaster_white", "brick", "concrete", "glass", "block"] },
    roof: { type: "string", enum: ["flat", "gable"] },
    parking: { type: "integer" },
    basement: { type: "boolean" },
  },
} as const

const FLOOR_HEIGHT = 3500

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

export function buildDocFromSpec(raw: BuildingSpec): BuilderDocument {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo))
  const spec: BuildingSpec = {
    ...raw,
    floors: Math.round(clamp(raw.floors, 1, 10)),
    widthM: clamp(raw.widthM, 5, 120),
    depthM: clamp(raw.depthM, 5, 120),
    cols: Math.round(clamp(raw.cols, 1, 8)),
    rows: Math.round(clamp(raw.rows, 1, 6)),
    parking: Math.round(clamp(raw.parking, 0, 40)),
  }
  const W = (spec.widthM * 1000) / 2
  const H = (spec.depthM * 1000) / 2
  const EXT: WallDefaults = { thickness: 300, height: FLOOR_HEIGHT, kind: "exterior" }
  const INT: WallDefaults = { thickness: 150, height: FLOOR_HEIGHT, kind: "interior" }

  const building: Building = { id: uid("b"), name: spec.name.slice(0, 80) || "Здание", origin: { x: 0, y: 0 }, floors: [] }
  let doc: BuilderDocument = {
    id: uid("proj"),
    schemaVersion: 1,
    name: spec.name.slice(0, 80) || "AI-проект",
    site: { sizeX: 50000, sizeZ: 40000, groundMaterialId: "grass", objects: [], terrainRes: 64, water: [], paths: [], pavements: [] },
    buildings: [],
  }
  const run = (cmd: Command) => {
    doc = cmd.apply(doc)
  }

  run(new AddBuildingCommand(building))

  const levels: number[] = []
  if (spec.basement) levels.push(0)
  for (let i = 1; i <= spec.floors; i++) levels.push(i)

  const floors: Floor[] = []
  for (const level of levels) {
    const f = makeFloor(level)
    floors.push(f)
    run(new AddFloorCommand(building.id, f))
    const ext: WallDefaults = { ...EXT, kind: "exterior" }
    const facadeWall = (a: Vec2, b: Vec2) => {
      const cmd = new InsertWallCommand(f.id, a, b, ext)
      run(cmd)
    }
    // периметр (фасадный материал применяется через эджи: ставим обычные, материал — общий facade в движке)
    facadeWall(p(-W, -H), p(W, -H))
    facadeWall(p(W, -H), p(W, H))
    facadeWall(p(W, H), p(-W, H))
    facadeWall(p(-W, H), p(-W, -H))
    // вертикальные перегородки (cols-1)
    for (let c = 1; c < spec.cols; c++) {
      const x = -W + (2 * W * c) / spec.cols
      run(new InsertWallCommand(f.id, p(x, -H), p(x, H), INT))
    }
    // горизонтальные перегородки (rows-1)
    for (let r = 1; r < spec.rows; r++) {
      const y = -H + (2 * H * r) / spec.rows
      run(new InsertWallCommand(f.id, p(-W, y), p(W, y), INT))
    }

    // ── Проёмы: читаем АКТУАЛЬНЫЕ рёбра уже ПОСЛЕ построения стен этажа ──────────
    const built = findFloor(doc, f.id)
    if (built) {
      const g = built.wallGraph
      const edgeLen = (a: string, b: string): number => {
        const na = g.nodes[a]
        const nb = g.nodes[b]
        if (!na || !nb) return 0
        return Math.hypot(nb.x - na.x, nb.y - na.y)
      }
      // «передняя» сторона плана — ребро с минимальным y (y == -H у периметра)
      const isFrontEdge = (a: string, b: string): boolean => {
        const na = g.nodes[a]
        const nb = g.nodes[b]
        if (!na || !nb) return false
        return Math.abs(na.y - -H) < 1 && Math.abs(nb.y - -H) < 1
      }
      const exteriorEdges = Object.values(g.edges).filter((e) => e.kind === "exterior")
      const interiorEdges = Object.values(g.edges).filter((e) => e.kind === "interior")

      const win = findPreset("window", "standard")
      const minEdgeForWindow = win.width + 400

      // Подвал/цоколь (level<=0) — окна реже/пропускаем
      const isAbove = level > 0

      // 1. Окна на каждом наружном ребре (для надземных этажей)
      if (isAbove) {
        for (const e of exteriorEdges) {
          const len = edgeLen(e.a, e.b)
          if (len <= minEdgeForWindow) continue
          // 1-2 окна: при достаточной длине — по третям, иначе одно по центру
          const offsets: number[] = len > win.width * 2 + 800 ? [len / 3, (2 * len) / 3] : [len / 2]
          for (const center of offsets) {
            const offset = clamp(center - win.width / 2, 100, len - win.width - 100)
            run(
              new AddOpeningCommand(f.id, {
                id: uid("op"),
                wallId: e.id,
                type: "window",
                variant: win.variant,
                width: win.width,
                height: win.height,
                sillHeight: win.sill,
                offset,
              }),
            )
          }
        }
      }

      // 2. Двери — только на первом надземном этаже (level === 1)
      if (level === 1) {
        // входная дверь на одном переднем наружном ребре
        const frontDoorEdge =
          exteriorEdges.find((e) => isFrontEdge(e.a, e.b) && edgeLen(e.a, e.b) > 1200) ??
          exteriorEdges.find((e) => edgeLen(e.a, e.b) > 1200)
        if (frontDoorEdge) {
          const door = findPreset("door", "single")
          const len = edgeLen(frontDoorEdge.a, frontDoorEdge.b)
          run(
            new AddOpeningCommand(f.id, {
              id: uid("op"),
              wallId: frontDoorEdge.id,
              type: "door",
              variant: door.variant,
              width: door.width,
              height: door.height,
              sillHeight: door.sill,
              offset: clamp(len / 2 - door.width / 2, 100, len - door.width - 100),
            }),
          )
        }
        // межкомнатные двери на паре внутренних стен
        const intDoor = findPreset("door", "interior")
        for (const e of interiorEdges.slice(0, 2)) {
          const len = edgeLen(e.a, e.b)
          if (len <= intDoor.width + 400) continue
          run(
            new AddOpeningCommand(f.id, {
              id: uid("op"),
              wallId: e.id,
              type: "door",
              variant: intDoor.variant,
              width: intDoor.width,
              height: intDoor.height,
              sillHeight: intDoor.sill,
              offset: clamp(len / 2 - intDoor.width / 2, 100, len - intDoor.width - 100),
            }),
          )
        }
      }
    }
  }

  // 3. Лестницы: связываем последовательные НАДЗЕМНЫЕ этажи (1→2→…)
  const aboveFloors = floors.filter((fl) => fl.level > 0).sort((a, b) => a.level - b.level)
  for (let i = 0; i < aboveFloors.length - 1; i++) {
    const from = aboveFloors[i]
    const to = aboveFloors[i + 1]
    // угол плана в мм в пределах контура (отступ от внутренних углов)
    const stairW = 1200
    run(
      new AddStairCommand(from.id, {
        id: uid("st"),
        shape: "u",
        fromFloorId: from.id,
        toFloorId: to.id,
        position: { x: clamp(W - 2500, -W, W), y: clamp(H - 3500, -H, H) },
        rotationDeg: 0,
        width: stairW,
        railing: true,
      }),
    )
  }

  // фасадный материал на наружные стены всех этажей
  doc = {
    ...doc,
    buildings: doc.buildings.map((b) => ({
      ...b,
      floors: b.floors.map((fl) => {
        const edges = { ...fl.wallGraph.edges }
        for (const id in edges) {
          if (edges[id].kind === "exterior") edges[id] = { ...edges[id], facadeMaterialId: spec.facade }
        }
        return { ...fl, wallGraph: { nodes: fl.wallGraph.nodes, edges } }
      }),
    })),
  }

  const top = floors[floors.length - 1]
  run(new SetRoofCommand(top.id, { type: spec.roof, pitchDeg: spec.roof === "gable" ? 25 : 0, overhang: 500, thickness: 200, materialId: "metal_roof" }))

  // парковка перед зданием рядами
  const objs: BuilderObject[] = []
  const perRow = 8
  for (let i = 0; i < spec.parking; i++) {
    const col = i % perRow
    const row = Math.floor(i / perRow)
    objs.push({
      id: uid("o"),
      assetId: "parking",
      position: { x: (col - perRow / 2) * 2800, y: 0, z: H + 4000 + row * 6000 },
      rotationY: 0,
      scale: 1,
      attachTo: "terrain",
      locked: false,
    })
  }
  // немного озеленения
  objs.push({ id: uid("o"), assetId: "tree", position: { x: -W - 4000, y: 0, z: -H - 3000 }, rotationY: 0, scale: 1, attachTo: "terrain", locked: false })
  objs.push({ id: uid("o"), assetId: "spruce", position: { x: W + 4000, y: 0, z: -H - 3000 }, rotationY: 0, scale: 1, attachTo: "terrain", locked: false })
  for (const o of objs) run(new AddObjectCommand({ site: true }, o))

  return doc
}
