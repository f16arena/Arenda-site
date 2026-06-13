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
} from "@/core/document/commands"
import { emptyGraph, type WallDefaults } from "@/core/geometry/wall-graph"
import type { Vec2 } from "@/core/geometry/math"

export const BuildingSpecSchema = z.object({
  name: z.string(),
  floors: z.number().int().min(1).max(10),
  widthM: z.number().min(5).max(120),
  depthM: z.number().min(5).max(120),
  cols: z.number().int().min(1).max(8),
  rows: z.number().int().min(1).max(6),
  facade: z.enum(["plaster_white", "brick", "concrete", "glass", "block"]),
  roof: z.enum(["flat", "gable"]),
  parking: z.number().int().min(0).max(40),
  basement: z.boolean(),
})
export type BuildingSpec = z.infer<typeof BuildingSpecSchema>

// JSON-schema для Anthropic output_config (структурный вывод).
export const BUILDING_SPEC_JSONSCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "floors", "widthM", "depthM", "cols", "rows", "facade", "roof", "parking", "basement"],
  properties: {
    name: { type: "string" },
    floors: { type: "integer", minimum: 1, maximum: 10 },
    widthM: { type: "number", minimum: 5, maximum: 120 },
    depthM: { type: "number", minimum: 5, maximum: 120 },
    cols: { type: "integer", minimum: 1, maximum: 8 },
    rows: { type: "integer", minimum: 1, maximum: 6 },
    facade: { type: "string", enum: ["plaster_white", "brick", "concrete", "glass", "block"] },
    roof: { type: "string", enum: ["flat", "gable"] },
    parking: { type: "integer", minimum: 0, maximum: 40 },
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

export function buildDocFromSpec(spec: BuildingSpec): BuilderDocument {
  const W = (spec.widthM * 1000) / 2
  const H = (spec.depthM * 1000) / 2
  const EXT: WallDefaults = { thickness: 300, height: FLOOR_HEIGHT, kind: "exterior" }
  const INT: WallDefaults = { thickness: 150, height: FLOOR_HEIGHT, kind: "interior" }

  const building: Building = { id: uid("b"), name: spec.name.slice(0, 80) || "Здание", origin: { x: 0, y: 0 }, floors: [] }
  let doc: BuilderDocument = {
    id: uid("proj"),
    schemaVersion: 1,
    name: spec.name.slice(0, 80) || "AI-проект",
    site: { sizeX: 50000, sizeZ: 40000, groundMaterialId: "grass", objects: [], terrainRes: 64 },
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
