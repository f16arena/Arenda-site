"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireSection } from "@/lib/acl"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { tariffScope } from "@/lib/tenant-scope"

async function assertTariffInOrg(id: string, orgId: string) {
  const found = await db.tariff.findFirst({
    where: { id, ...tariffScope(orgId) },
    select: { id: true },
  })
  if (!found) throw new Error("Тариф не найден или нет доступа")
}

export async function createTariff(buildingId: string, formData: FormData) {
  await requireSection("finances", "edit")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

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
  await requireSection("finances", "edit")
  const { orgId } = await requireOrgAccess()
  await assertTariffInOrg(tariffId, orgId)

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
  await requireSection("finances", "edit")
  const { orgId } = await requireOrgAccess()
  await assertTariffInOrg(tariffId, orgId)

  await db.tariff.delete({ where: { id: tariffId } })
  revalidatePath("/admin/settings")
  revalidatePath("/admin/tariffs")
}
