"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function updateBuilding(buildingId: string, formData: FormData) {
  const name = formData.get("name") as string
  const address = formData.get("address") as string
  const description = formData.get("description") as string
  const phone = formData.get("phone") as string
  const email = formData.get("email") as string
  const responsible = formData.get("responsible") as string
  const totalAreaStr = formData.get("totalArea") as string

  await db.building.update({
    where: { id: buildingId },
    data: {
      name,
      address,
      description: description || null,
      phone: phone || null,
      email: email || null,
      responsible: responsible || null,
      totalArea: totalAreaStr ? parseFloat(totalAreaStr) : null,
    },
  })

  revalidatePath("/admin/settings")
  revalidatePath("/admin/spaces")
  return { success: true }
}

export async function updateFloor(floorId: string, formData: FormData) {
  const name = formData.get("name") as string
  const rateStr = formData.get("ratePerSqm") as string
  const areaStr = formData.get("totalArea") as string

  await db.floor.update({
    where: { id: floorId },
    data: {
      name,
      ratePerSqm: rateStr ? parseFloat(rateStr) : 0,
      totalArea: areaStr ? parseFloat(areaStr) : null,
    },
  })

  revalidatePath("/admin/settings")
  revalidatePath("/admin/spaces")
  return { success: true }
}

export async function updateEmergencyContact(id: string, formData: FormData) {
  const name = formData.get("name") as string
  const phone = formData.get("phone") as string

  await db.emergencyContact.update({
    where: { id },
    data: { name, phone },
  })

  revalidatePath("/admin/settings")
  revalidatePath("/admin/emergency")
  return { success: true }
}

export async function addEmergencyContact(buildingId: string, formData: FormData) {
  const name = formData.get("name") as string
  const phone = formData.get("phone") as string
  const category = formData.get("category") as string

  await db.emergencyContact.create({
    data: { buildingId, name, phone, category },
  })

  revalidatePath("/admin/settings")
  revalidatePath("/admin/emergency")
  return { success: true }
}

export async function deleteEmergencyContact(id: string) {
  await db.emergencyContact.delete({ where: { id } })
  revalidatePath("/admin/settings")
  revalidatePath("/admin/emergency")
  return { success: true }
}
