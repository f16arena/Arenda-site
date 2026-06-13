// ADR: Документ проекта — единственный источник правды (§4.1). Zod-схема + выведенные
// типы. Геометрия (комнаты, меши) НЕ хранится — выводится из графа стен функциями ядра.
// schemaVersion фиксирует версию для миграций (core/document/migrations — Фаза 5).

import { z } from "zod"

export const SCHEMA_VERSION = 1

export const Vec2Schema = z.object({ x: z.number(), y: z.number() })
export const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() })

export const WallKindSchema = z.enum(["exterior", "interior", "partition"])

export const GraphNodeSchema = z.object({ id: z.string(), x: z.number(), y: z.number() })
export const WallEdgeSchema = z.object({
  id: z.string(),
  a: z.string(),
  b: z.string(),
  thickness: z.number(),
  height: z.number(),
  kind: WallKindSchema,
  facadeMaterialId: z.string().optional(),
  interiorMaterialId: z.string().optional(),
})
export const WallGraphSchema = z.object({
  nodes: z.record(z.string(), GraphNodeSchema),
  edges: z.record(z.string(), WallEdgeSchema),
})

export const OpeningSchema = z.object({
  id: z.string(),
  wallId: z.string(),
  type: z.enum(["door", "window"]),
  variant: z.string().default("single"),
  width: z.number(),
  height: z.number(),
  sillHeight: z.number(),
  offset: z.number(),
})

export const StairSchema = z.object({
  id: z.string(),
  shape: z.enum(["straight", "l", "u", "spiral"]),
  fromFloorId: z.string(),
  toFloorId: z.string(),
  position: Vec2Schema,
  rotationDeg: z.number(),
  width: z.number(),
  railing: z.boolean(),
  // Зеркальное отражение по локальной оси X (меняет сторону поворота Г/П и перил).
  mirror: z.boolean().optional(),
})

export const BuilderObjectSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  position: Vec3Schema,
  rotationY: z.number(),
  scale: z.number(),
  // Необязательные множители по ширине (X) и глубине (Z) поверх общего scale.
  // optional (не default) — чтобы старые объекты без полей не ломали типы literal'ов.
  scaleX: z.number().optional(),
  scaleZ: z.number().optional(),
  attachTo: z.enum(["floor", "wall", "ceiling", "terrain"]).default("floor"),
  locked: z.boolean().default(false),
})

export const RoofConfigSchema = z.object({
  type: z.enum(["flat", "gable", "hip", "fourslope", "mansard", "shed"]),
  pitchDeg: z.number(),
  overhang: z.number(),
  thickness: z.number(),
  materialId: z.string().optional(),
})

export const FloorSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number(), // -2,-1,0=цоколь,1,2,...; tech/roof — числами выше
  elevation: z.number(), // отметка пола, мм
  height: z.number(), // высота этажа, мм
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  opacity: z.number().default(1),
  wallGraph: WallGraphSchema,
  openings: z.array(OpeningSchema).default([]),
  stairs: z.array(StairSchema).default([]),
  objects: z.array(BuilderObjectSchema).default([]),
  roof: RoofConfigSchema.optional(),
  premiseLinks: z.record(z.string(), z.string()).default({}), // roomId → premiseId
  floorMaterialId: z.string().optional(),
  roomMaterials: z.record(z.string(), z.string()).default({}), // roomId → materialId (ведро)
})

export const BuildingSchema = z.object({
  id: z.string(),
  name: z.string(),
  origin: Vec2Schema.default({ x: 0, y: 0 }),
  floors: z.array(FloorSchema).default([]),
})

export const SiteObjectSchema = BuilderObjectSchema

// Водоём по контуру (сплайн-полигон): точки в мм (план x→X, y→Z), глубина прокопа в мм.
export const WaterBodySchema = z.object({
  id: z.string(),
  points: z.array(Vec2Schema),
  depth: z.number().default(800),
  kind: z.enum(["pond", "pool", "river"]).default("pond"),
})

// Площадка-покрытие: замкнутый контур (точки в мм), залитый одним материалом без швов.
export const PavementSchema = z.object({
  id: z.string(),
  points: z.array(Vec2Schema),
  materialId: z.string().default("asphalt"),
})

// Линейный элемент по сплайну: дорога/дорожка (лента по земле) или забор (столбы+рейлы).
// style — вид забора (профнастил/штакетник/3D-сетка/ковка/дерево). default "wood" — чтобы
// ранее нарисованные заборы (без поля) выглядели как раньше; новые ставятся металлом из UI.
export const PathFeatureSchema = z.object({
  id: z.string(),
  points: z.array(Vec2Schema),
  width: z.number().default(3000),
  kind: z.enum(["road", "path", "fence"]).default("road"),
  style: z.enum(["wood", "profnastil", "shtaketnik", "mesh", "forged"]).default("wood"),
})

export const SiteSchema = z.object({
  sizeX: z.number().default(50000),
  sizeZ: z.number().default(40000),
  groundMaterialId: z.string().default("grass"),
  objects: z.array(SiteObjectSchema).default([]),
  // Рельеф: плоский heightmap (terrainRes×terrainRes), высоты в метрах. Фаза 4.
  terrainRes: z.number().default(64),
  heightmap: z.array(z.number()).optional(),
  // Водоёмы по контуру (Фаза v4: вода по сплайну + прокоп русла).
  water: z.array(WaterBodySchema).default([]),
  // Дороги/дорожки/заборы по сплайну (Фаза v4: линейные элементы).
  paths: z.array(PathFeatureSchema).default([]),
  // Площадки-покрытия по контуру (асфальт/брусчатка/газон и т.п.).
  pavements: z.array(PavementSchema).default([]),
})

export const ProjectSchema = z.object({
  id: z.string(),
  schemaVersion: z.number().default(SCHEMA_VERSION),
  name: z.string(),
  site: SiteSchema,
  buildings: z.array(BuildingSchema).default([]),
})

export type Vec2DTO = z.infer<typeof Vec2Schema>
export type WallKind = z.infer<typeof WallKindSchema>
export type Opening = z.infer<typeof OpeningSchema>
export type Stair = z.infer<typeof StairSchema>
export type BuilderObject = z.infer<typeof BuilderObjectSchema>
export type RoofConfig = z.infer<typeof RoofConfigSchema>
export type Floor = z.infer<typeof FloorSchema>
export type Building = z.infer<typeof BuildingSchema>
export type WaterBody = z.infer<typeof WaterBodySchema>
export type PathFeature = z.infer<typeof PathFeatureSchema>
export type Pavement = z.infer<typeof PavementSchema>
export type Site = z.infer<typeof SiteSchema>
export type BuilderDocument = z.infer<typeof ProjectSchema>

export function parseDocument(input: unknown): BuilderDocument {
  return ProjectSchema.parse(input)
}
