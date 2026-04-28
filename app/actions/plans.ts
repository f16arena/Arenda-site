"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requirePlatformOwner } from "@/lib/org"

export async function createPlan(formData: FormData) {
  await requirePlatformOwner()

  const code = String(formData.get("code") ?? "").trim().toUpperCase()
  const name = String(formData.get("name") ?? "").trim()
  if (!code) throw new Error("Code обязателен")
  if (!name) throw new Error("Название обязательно")

  await db.plan.create({
    data: {
      code,
      name,
      description: String(formData.get("description") ?? "") || null,
      priceMonthly: parseFloat(String(formData.get("priceMonthly") ?? "0")) || 0,
      priceYearly: parseFloat(String(formData.get("priceYearly") ?? "0")) || 0,
      maxBuildings: parseIntOrNull(formData.get("maxBuildings")),
      maxTenants: parseIntOrNull(formData.get("maxTenants")),
      maxUsers: parseIntOrNull(formData.get("maxUsers")),
      maxLeads: parseIntOrNull(formData.get("maxLeads")),
      features: buildFeaturesJson(formData),
      isActive: formData.get("isActive") === "on",
      sortOrder: parseInt(String(formData.get("sortOrder") ?? "0")) || 0,
    },
  })

  revalidatePath("/superadmin/plans")
}

export async function updatePlan(planId: string, formData: FormData) {
  await requirePlatformOwner()

  await db.plan.update({
    where: { id: planId },
    data: {
      name: String(formData.get("name") ?? "").trim(),
      description: String(formData.get("description") ?? "") || null,
      priceMonthly: parseFloat(String(formData.get("priceMonthly") ?? "0")) || 0,
      priceYearly: parseFloat(String(formData.get("priceYearly") ?? "0")) || 0,
      maxBuildings: parseIntOrNull(formData.get("maxBuildings")),
      maxTenants: parseIntOrNull(formData.get("maxTenants")),
      maxUsers: parseIntOrNull(formData.get("maxUsers")),
      maxLeads: parseIntOrNull(formData.get("maxLeads")),
      features: buildFeaturesJson(formData),
      isActive: formData.get("isActive") === "on",
      sortOrder: parseInt(String(formData.get("sortOrder") ?? "0")) || 0,
    },
  })

  revalidatePath("/superadmin/plans")
}

export async function deletePlan(planId: string) {
  await requirePlatformOwner()

  // Не позволяем удалить если есть организации
  const count = await db.organization.count({ where: { planId } })
  if (count > 0) {
    throw new Error(`Нельзя удалить — на этом тарифе ${count} организаций. Сначала переведите их на другой тариф.`)
  }

  await db.plan.delete({ where: { id: planId } })
  revalidatePath("/superadmin/plans")
}

function parseIntOrNull(v: FormDataEntryValue | null): number | null {
  if (v === null || v === "") return null
  const n = parseInt(String(v))
  return Number.isNaN(n) ? null : n
}

const FEATURE_KEYS = [
  "emailNotifications", "telegramBot", "floorEditor", "contractTemplates",
  "bankImport", "excelExport", "export1c", "cmdkSearch", "customDomain",
  "api", "whiteLabel", "aiAssistant", "prioritySupport",
] as const

function buildFeaturesJson(formData: FormData): string {
  const features: Record<string, boolean> = {}
  for (const key of FEATURE_KEYS) {
    features[key] = formData.get(`feature_${key}`) === "on"
  }
  return JSON.stringify(features)
}
