"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { assertBuildingInOrg } from "@/lib/scope-guards"

const DECOR_KINDS = new Set([
  "tree", "spruce", "birch", "bush", "grass", "flowerbed",
  "wall", "halfwall", "window", "fence", "gate", "door", "stairs",
  "bench", "lamp", "bin", "canopy", "parking", "road", "mast",
  "hvac", "vent", "tank", "radiator",
  "toilet", "urinal", "sink", "stall",
  "table", "chair", "cabinet", "sofa", "shelf", "reception", "partition",
])
// Семейства с вариантами: floor-*, wall-*, door-*, fence-*, column-*.
const DECOR_PREFIXES = ["floor-", "wall-", "door-", "fence-", "column-", "stairs-"]
function isValidKind(kind: string): boolean {
  return DECOR_KINDS.has(kind) || DECOR_PREFIXES.some((p) => kind.startsWith(p))
}

async function assertDecorBuilding(decorId: string, orgId: string) {
  const decor = await db.buildingDecor.findUnique({ where: { id: decorId }, select: { buildingId: true } })
  if (!decor) throw new Error("Элемент декора не найден")
  await assertBuildingInOrg(decor.buildingId, orgId)
  return decor.buildingId
}

/** Добавить предмет в здание на уровень (ground/roof/<floorId>). Спавн задаёт 3D. */
export async function addBuildingDecor(buildingId: string, kind: string, x = 0, z = 0, level = "ground") {
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)
  const k = isValidKind(kind) ? kind : "tree"
  const lvl = typeof level === "string" && level.trim() ? level.trim().slice(0, 64) : "ground"
  const decor = await db.buildingDecor.create({
    data: {
      buildingId,
      kind: k,
      x: Number.isFinite(x) ? x : 0,
      z: Number.isFinite(z) ? z : 0,
      rot: 0,
      scale: 1,
      level: lvl,
      onRoof: lvl === "roof",
    },
  })
  revalidatePath("/admin/buildings")
  return { id: decor.id }
}

/** Добавить нарисованную стену: центр (x,z), угол rot°, длина len м, уровень. */
export async function addWallSegment(buildingId: string, x: number, z: number, len: number, rot: number, level = "ground") {
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)
  const lvl = typeof level === "string" && level.trim() ? level.trim().slice(0, 64) : "ground"
  const length = Number.isFinite(len) ? Math.max(0.5, Math.min(100, len)) : 1
  const decor = await db.buildingDecor.create({
    data: {
      buildingId,
      kind: "wallrun",
      x: Number.isFinite(x) ? x : 0,
      z: Number.isFinite(z) ? z : 0,
      rot: Number.isFinite(rot) ? ((rot % 360) + 360) % 360 : 0,
      scale: 1,
      len: length,
      level: lvl,
      onRoof: lvl === "roof",
    },
  })
  revalidatePath("/admin/buildings")
  return { id: decor.id }
}

/** Дублировать предмет (копия со смещением 1.5 м, тот же уровень/поворот/масштаб). */
export async function duplicateBuildingDecor(decorId: string) {
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  await assertDecorBuilding(decorId, orgId)
  const src = await db.buildingDecor.findUnique({ where: { id: decorId } })
  if (!src) throw new Error("Предмет не найден")
  const copy = await db.buildingDecor.create({
    data: {
      buildingId: src.buildingId,
      kind: src.kind,
      x: src.x + 1.5,
      z: src.z + 1.5,
      rot: src.rot,
      scale: src.scale,
      len: src.len,
      level: src.level,
      onRoof: src.onRoof,
      modelUrl: src.modelUrl,
    },
  })
  revalidatePath("/admin/buildings")
  return { id: copy.id }
}

/** Воссоздать предмет (для «отмены удаления») из сохранённых данных. */
export async function recreateDecor(buildingId: string, data: {
  kind: string; x: number; z: number; rot: number; scale: number; len: number; level: string; onRoof: boolean; modelUrl: string | null
}) {
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)
  const kind = isValidKind(data.kind) || data.kind === "custom" || data.kind === "wallrun" ? data.kind : "tree"
  const decor = await db.buildingDecor.create({
    data: {
      buildingId,
      kind,
      x: Number.isFinite(data.x) ? data.x : 0,
      z: Number.isFinite(data.z) ? data.z : 0,
      rot: Number.isFinite(data.rot) ? data.rot : 0,
      scale: Number.isFinite(data.scale) && data.scale > 0 ? data.scale : 1,
      len: Number.isFinite(data.len) ? data.len : 0,
      level: typeof data.level === "string" && data.level.trim() ? data.level.trim().slice(0, 64) : "ground",
      onRoof: !!data.onRoof,
      modelUrl: data.modelUrl ?? null,
    },
  })
  revalidatePath("/admin/buildings")
  return { id: decor.id }
}

/** Задать длину нарисованной стены (kind="wallrun"), м. Диапазон 0.5–100. */
export async function setDecorLen(decorId: string, len: number) {
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  await assertDecorBuilding(decorId, orgId)
  const length = Number.isFinite(len) ? Math.max(0.5, Math.min(100, len)) : 1
  await db.buildingDecor.update({ where: { id: decorId }, data: { len: length } })
  revalidatePath("/admin/buildings")
  return { success: true }
}

/** Сменить вид/материал предмета (например wall → wall-brick). Валидируется. */
export async function setDecorKind(decorId: string, kind: string) {
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  await assertDecorBuilding(decorId, orgId)
  if (!isValidKind(kind)) throw new Error("Недопустимый вид предмета")
  await db.buildingDecor.update({ where: { id: decorId }, data: { kind } })
  revalidatePath("/admin/buildings")
  return { success: true }
}

/** Переместить предмет на другой уровень (ground/roof/<floorId>). */
export async function setDecorLevel(decorId: string, level: string) {
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  await assertDecorBuilding(decorId, orgId)
  const lvl = typeof level === "string" && level.trim() ? level.trim().slice(0, 64) : "ground"
  await db.buildingDecor.update({ where: { id: decorId }, data: { level: lvl, onRoof: lvl === "roof" } })
  revalidatePath("/admin/buildings")
  return { success: true }
}

/** Изменить масштаб предмета (0.3–5). */
export async function setDecorScale(decorId: string, scale: number) {
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  await assertDecorBuilding(decorId, orgId)
  const s = Number.isFinite(scale) ? Math.max(0.3, Math.min(5, scale)) : 1
  await db.buildingDecor.update({ where: { id: decorId }, data: { scale: s } })
  return { success: true }
}

export async function setDecorPosition(decorId: string, x: number, z: number) {
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  await assertDecorBuilding(decorId, orgId)
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error("Некорректная позиция")
  await db.buildingDecor.update({ where: { id: decorId }, data: { x, z } })
  return { success: true }
}

export async function setDecorRotation(decorId: string, deg: number) {
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  await assertDecorBuilding(decorId, orgId)
  const rot = Number.isFinite(deg) ? ((deg % 360) + 360) % 360 : 0
  await db.buildingDecor.update({ where: { id: decorId }, data: { rot } })
  return { success: true }
}

export async function deleteBuildingDecor(decorId: string) {
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  await assertDecorBuilding(decorId, orgId)
  await db.buildingDecor.delete({ where: { id: decorId } })
  revalidatePath("/admin/buildings")
  return { success: true }
}
