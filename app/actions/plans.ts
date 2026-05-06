"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { audit } from "@/lib/audit"
import { PLAN_CAPABILITY_KEYS, PLAN_USAGE_LIMITS } from "@/lib/plan-capabilities"

export async function createPlan(formData: FormData) {
  await requirePlatformOwner()

  const code = normalizeCode(formData.get("code"))
  const name = normalizeRequiredText(formData.get("name"), "Название тарифа")

  const plan = await db.plan.create({
    data: {
      code,
      name,
      description: normalizeOptionalText(formData.get("description")),
      priceMonthly: parseMoney(formData.get("priceMonthly")),
      priceYearly: parseMoney(formData.get("priceYearly")),
      maxBuildings: parseIntOrNull(formData.get("maxBuildings")),
      maxTenants: parseIntOrNull(formData.get("maxTenants")),
      maxUsers: parseIntOrNull(formData.get("maxUsers")),
      maxLeads: parseIntOrNull(formData.get("maxLeads")),
      features: buildFeaturesJson(formData),
      isActive: formData.get("isActive") === "on",
      sortOrder: parseIntOrZero(formData.get("sortOrder")),
    },
  })

  await audit({
    action: "CREATE",
    entity: "tariff",
    entityId: plan.id,
    details: { code: plan.code, name: plan.name },
  })
  revalidatePlans()
}

export async function updatePlan(planId: string, formData: FormData) {
  await requirePlatformOwner()

  const before = await db.plan.findUnique({
    where: { id: planId },
    select: { id: true, code: true, name: true, features: true },
  })
  if (!before) throw new Error("Тариф не найден")

  const name = normalizeRequiredText(formData.get("name"), "Название тарифа")

  const plan = await db.plan.update({
    where: { id: planId },
    data: {
      name,
      description: normalizeOptionalText(formData.get("description")),
      priceMonthly: parseMoney(formData.get("priceMonthly")),
      priceYearly: parseMoney(formData.get("priceYearly")),
      maxBuildings: parseIntOrNull(formData.get("maxBuildings")),
      maxTenants: parseIntOrNull(formData.get("maxTenants")),
      maxUsers: parseIntOrNull(formData.get("maxUsers")),
      maxLeads: parseIntOrNull(formData.get("maxLeads")),
      features: buildFeaturesJson(formData),
      isActive: formData.get("isActive") === "on",
      sortOrder: parseIntOrZero(formData.get("sortOrder")),
    },
  })

  await audit({
    action: "UPDATE",
    entity: "tariff",
    entityId: plan.id,
    details: {
      code: before.code,
      beforeName: before.name,
      afterName: plan.name,
      featuresChanged: before.features !== plan.features,
    },
  })
  revalidatePlans()
}

export async function duplicatePlan(planId: string) {
  await requirePlatformOwner()

  const source = await db.plan.findUnique({ where: { id: planId } })
  if (!source) throw new Error("Тариф не найден")

  const code = await nextCopyCode(source.code)
  const plan = await db.plan.create({
    data: {
      code,
      name: `${source.name} копия`,
      description: source.description,
      priceMonthly: source.priceMonthly,
      priceYearly: source.priceYearly,
      maxBuildings: source.maxBuildings,
      maxTenants: source.maxTenants,
      maxUsers: source.maxUsers,
      maxLeads: source.maxLeads,
      features: source.features,
      isActive: false,
      sortOrder: source.sortOrder + 1,
    },
  })

  await audit({
    action: "CREATE",
    entity: "tariff",
    entityId: plan.id,
    details: { copiedFrom: source.id, sourceCode: source.code, code: plan.code },
  })
  revalidatePlans()
}

export async function deletePlan(planId: string) {
  await requirePlatformOwner()

  const plan = await db.plan.findUnique({
    where: { id: planId },
    select: { id: true, code: true, name: true, _count: { select: { organizations: true } } },
  })
  if (!plan) throw new Error("Тариф не найден")
  if (plan._count.organizations > 0) {
    throw new Error(
      `Нельзя удалить тариф: его используют ${plan._count.organizations} организаций. Сначала переведите клиентов на другой тариф.`,
    )
  }

  await db.plan.delete({ where: { id: planId } })
  await audit({
    action: "DELETE",
    entity: "tariff",
    entityId: plan.id,
    details: { code: plan.code, name: plan.name },
  })
  revalidatePlans()
}

function revalidatePlans() {
  revalidatePath("/superadmin")
  revalidatePath("/superadmin/plans")
  revalidatePath("/superadmin/orgs")
}

async function nextCopyCode(sourceCode: string) {
  const base = `${sourceCode}_COPY`.slice(0, 26)
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? base : `${base}_${i}`
    const exists = await db.plan.findUnique({ where: { code: candidate }, select: { id: true } })
    if (!exists) return candidate
  }
  throw new Error("Не удалось подобрать свободный код копии тарифа")
}

function buildFeaturesJson(formData: FormData): string {
  const features: Record<string, unknown> = {}

  for (const key of PLAN_CAPABILITY_KEYS) {
    features[key] = formData.get(`feature_${key}`) === "on"
  }

  const limits: Record<string, number | null> = {}
  for (const limit of PLAN_USAGE_LIMITS) {
    limits[limit.key] = parseNumberOrNull(formData.get(`limit_${limit.key}`))
  }
  features.limits = limits

  const highlights = String(formData.get("highlights") ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
  features.highlights = highlights

  return JSON.stringify(features)
}

function normalizeCode(value: FormDataEntryValue | null) {
  const code = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "_")
  if (!code) throw new Error("Код тарифа обязателен")
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
    throw new Error("Код тарифа должен быть 2-32 символа: латиница, цифры, _ или -")
  }
  return code
}

function normalizeRequiredText(value: FormDataEntryValue | null, fieldName: string) {
  const text = String(value ?? "").trim()
  if (!text) throw new Error(`${fieldName} обязательно`)
  return text
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim()
  return text || null
}

function parseMoney(value: FormDataEntryValue | null) {
  const number = parseNumber(value)
  if (number === null) return 0
  return number
}

function parseIntOrNull(value: FormDataEntryValue | null): number | null {
  const number = parseNumber(value)
  if (number === null) return null
  return Math.floor(number)
}

function parseIntOrZero(value: FormDataEntryValue | null): number {
  return parseIntOrNull(value) ?? 0
}

function parseNumberOrNull(value: FormDataEntryValue | null): number | null {
  return parseNumber(value)
}

function parseNumber(value: FormDataEntryValue | null): number | null {
  if (value === null || value === "") return null
  const number = Number(String(value).replace(",", "."))
  if (!Number.isFinite(number)) return null
  if (number < 0) throw new Error("Числовые значения не могут быть отрицательными")
  return number
}
