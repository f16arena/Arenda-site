"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function createSpace(formData: FormData) {
  const floorId = formData.get("floorId") as string
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
  const space = await db.space.findUnique({ where: { id }, include: { tenant: true } })
  if (space?.tenant) return { error: "Нельзя удалить — есть арендатор" }

  await db.space.delete({ where: { id } })
  revalidatePath("/admin/spaces")
  return { success: true }
}
