"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { assertBuildingInOrg } from "@/lib/scope-guards"

const DECOR_KINDS = new Set(["tree", "bush", "lamp", "bench"])

async function assertDecorBuilding(decorId: string, orgId: string) {
  const decor = await db.buildingDecor.findUnique({ where: { id: decorId }, select: { buildingId: true } })
  if (!decor) throw new Error("Элемент декора не найден")
  await assertBuildingInOrg(decor.buildingId, orgId)
  return decor.buildingId
}

/** Добавить элемент декора в здание (спавн-точку задаёт 3D — перед зданием). */
export async function addBuildingDecor(buildingId: string, kind: string, x = 0, z = 0) {
  await requireCapabilityAndFeature("spaces.edit")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)
  const k = DECOR_KINDS.has(kind) ? kind : "tree"
  const decor = await db.buildingDecor.create({
    data: {
      buildingId,
      kind: k,
      x: Number.isFinite(x) ? x : 0,
      z: Number.isFinite(z) ? z : 0,
      rot: 0,
    },
  })
  revalidatePath("/admin/buildings")
  return { id: decor.id }
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
