"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { assertBuildingInOrg } from "@/lib/scope-guards"

const DECOR_KINDS = new Set([
  "tree", "bush", "grass", "flowerbed",
  "wall", "fence", "gate", "door", "stairs",
  "bench", "lamp", "bin", "canopy",
  "hvac", "vent", "tank",
  "table", "chair", "cabinet",
])

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
  const k = DECOR_KINDS.has(kind) ? kind : "tree"
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
