"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { assertFloorInOrg, assertSpaceInOrg } from "@/lib/scope-guards"

export async function createSpace(formData: FormData) {
  const { orgId } = await requireOrgAccess()
  const floorId = formData.get("floorId") as string
  await assertFloorInOrg(floorId, orgId)

  const number = formData.get("number") as string
  const area = parseFloat(formData.get("area") as string)
  const description = formData.get("description") as string

  await db.space.create({
    data: { floorId, number, area, description: description || null, status: "VACANT" },
  })

  revalidatePath("/admin/spaces")
  return { success: true }
}

export async function updateSpace(id: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertSpaceInOrg(id, orgId)

  const number = formData.get("number") as string
  const area = parseFloat(formData.get("area") as string)
  const description = formData.get("description") as string
  const status = formData.get("status") as string

  await db.space.update({
    where: { id },
    data: { number, area, description: description || null, status },
  })

  revalidatePath("/admin/spaces")
  return { success: true }
}

export async function deleteSpace(id: string) {
  const { orgId } = await requireOrgAccess()
  await assertSpaceInOrg(id, orgId)

  const space = await db.space.findUnique({ where: { id }, include: { tenant: true } })
  if (space?.tenant) return { error: "Нельзя удалить — есть арендатор" }

  await db.space.delete({ where: { id } })
  revalidatePath("/admin/spaces")
  return { success: true }
}
