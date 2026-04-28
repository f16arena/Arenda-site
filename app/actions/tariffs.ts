"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/permissions"

export async function createTariff(buildingId: string, formData: FormData) {
  await requireAdmin()

  const type = String(formData.get("type") ?? "OTHER")
  const name = String(formData.get("name") ?? "").trim()
  const rateStr = String(formData.get("rate") ?? "")
  const unit = String(formData.get("unit") ?? "ед.")
  const description = String(formData.get("description") ?? "").trim()

  if (!name) throw new Error("Название обязательно")
  if (!rateStr) throw new Error("Тариф обязателен")

  await db.tariff.create({
    data: {
      buildingId,
      type,
      name,
      rate: parseFloat(rateStr),
      unit,
      description: description || null,
    },
  })

  revalidatePath("/admin/settings")
  revalidatePath("/admin/tariffs")
}

export async function updateTariff(tariffId: string, formData: FormData) {
  await requireAdmin()

  const name = String(formData.get("name") ?? "").trim()
  const rateStr = String(formData.get("rate") ?? "")
  const unit = String(formData.get("unit") ?? "ед.")
  const description = String(formData.get("description") ?? "").trim()
  const isActive = formData.get("isActive") === "on"

  if (!name) throw new Error("Название обязательно")
  if (!rateStr) throw new Error("Тариф обязателен")

  await db.tariff.update({
    where: { id: tariffId },
    data: {
      name,
      rate: parseFloat(rateStr),
      unit,
      description: description || null,
      isActive,
    },
  })

  revalidatePath("/admin/settings")
  revalidatePath("/admin/tariffs")
}

export async function deleteTariff(tariffId: string) {
  await requireAdmin()
  await db.tariff.delete({ where: { id: tariffId } })
  revalidatePath("/admin/settings")
  revalidatePath("/admin/tariffs")
}
