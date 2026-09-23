"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { audit } from "@/lib/audit"
import { PLAN_CAPABILITY_KEYS, PLAN_USAGE_LIMITS } from "@/lib/plan-capabilities"
import { PLANS_CACHE_TAG } from "@/lib/admin-shell-cache"
import { getT } from "@/lib/i18n/server"

// Переводчик передаём в синхронные помощники параметром: в файле с "use server"
// каждый export обязан быть async-функцией, поэтому getT() внутри них не вызвать.
type T = Awaited<ReturnType<typeof getT>>["t"]

export async function createPlan(formData: FormData) {
  await requirePlatformOwner()
  const { t } = await getT()

  const code = normalizeCode(formData.get("code"), t)
  const name = normalizeRequiredText(formData.get("name"), t("actions.plans.nameRequired"))

  const plan = await db.plan.create({
    data: {
      code,
      name,
      description: normalizeOptionalText(formData.get("description")),
      priceMonthly: parseMoney(formData.get("priceMonthly"), t),
      priceYearly: parseMoney(formData.get("priceYearly"), t),
      maxBuildings: parseIntOrNull(formData.get("maxBuildings"), t),
      maxTenants: parseIntOrNull(formData.get("maxTenants"), t),
      maxUsers: parseIntOrNull(formData.get("maxUsers"), t),
      maxLeads: parseIntOrNull(formData.get("maxLeads"), t),
      features: buildFeaturesJson(formData, t),
      isActive: formData.get("isActive") === "on",
      sortOrder: parseIntOrZero(formData.get("sortOrder"), t),
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
  const { t } = await getT()

  const before = await db.plan.findUnique({
    where: { id: planId },
    select: { id: true, code: true, name: true, features: true },
  })
  if (!before) throw new Error(t("actions.plans.notFound"))

  const name = normalizeRequiredText(formData.get("name"), t("actions.plans.nameRequired"))

  const plan = await db.plan.update({
    where: { id: planId },
    data: {
      name,
      description: normalizeOptionalText(formData.get("description")),
      priceMonthly: parseMoney(formData.get("priceMonthly"), t),
      priceYearly: parseMoney(formData.get("priceYearly"), t),
      maxBuildings: parseIntOrNull(formData.get("maxBuildings"), t),
      maxTenants: parseIntOrNull(formData.get("maxTenants"), t),
      maxUsers: parseIntOrNull(formData.get("maxUsers"), t),
      maxLeads: parseIntOrNull(formData.get("maxLeads"), t),
      features: buildFeaturesJson(formData, t),
      isActive: formData.get("isActive") === "on",
      sortOrder: parseIntOrZero(formData.get("sortOrder"), t),
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
  const { t } = await getT()

  const source = await db.plan.findUnique({ where: { id: planId } })
  if (!source) throw new Error(t("actions.plans.notFound"))

  const code = await nextCopyCode(source.code, t)
  const plan = await db.plan.create({
    data: {
      code,
      // Название тарифа — запись в БД, её видят все организации на любом языке,
      // поэтому суффикс копии остаётся русским.
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
  const { t } = await getT()

  const plan = await db.plan.findUnique({
    where: { id: planId },
    select: { id: true, code: true, name: true, _count: { select: { organizations: true } } },
  })
  if (!plan) throw new Error(t("actions.plans.notFound"))
  if (plan._count.organizations > 0) {
    throw new Error(t("actions.plans.inUse", { count: plan._count.organizations }))
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
  revalidateTag(PLANS_CACHE_TAG, { expire: 0 })
}

async function nextCopyCode(sourceCode: string, t: T) {
  const base = `${sourceCode}_COPY`.slice(0, 26)
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? base : `${base}_${i}`
    const exists = await db.plan.findUnique({ where: { code: candidate }, select: { id: true } })
    if (!exists) return candidate
  }
  throw new Error(t("actions.plans.copyCodeFailed"))
}

function buildFeaturesJson(formData: FormData, t: T): string {
  const features: Record<string, unknown> = {}

  for (const key of PLAN_CAPABILITY_KEYS) {
    features[key] = formData.get(`feature_${key}`) === "on"
  }

  const limits: Record<string, number | null> = {}
  for (const limit of PLAN_USAGE_LIMITS) {
    limits[limit.key] = parseNumberOrNull(formData.get(`limit_${limit.key}`), t)
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

function normalizeCode(value: FormDataEntryValue | null, t: T) {
  const code = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "_")
  if (!code) throw new Error(t("actions.plans.codeRequired"))
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
    throw new Error(t("actions.plans.codeFormat"))
  }
  return code
}

/** message — уже переведённый текст ошибки: «Название тарифа обязательно». */
function normalizeRequiredText(value: FormDataEntryValue | null, message: string) {
  const text = String(value ?? "").trim()
  if (!text) throw new Error(message)
  return text
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim()
  return text || null
}

function parseMoney(value: FormDataEntryValue | null, t: T) {
  const number = parseNumber(value, t)
  if (number === null) return 0
  return number
}

function parseIntOrNull(value: FormDataEntryValue | null, t: T): number | null {
  const number = parseNumber(value, t)
  if (number === null) return null
  return Math.floor(number)
}

function parseIntOrZero(value: FormDataEntryValue | null, t: T): number {
  return parseIntOrNull(value, t) ?? 0
}

function parseNumberOrNull(value: FormDataEntryValue | null, t: T): number | null {
  return parseNumber(value, t)
}

function parseNumber(value: FormDataEntryValue | null, t: T): number | null {
  if (value === null || value === "") return null
  const number = Number(String(value).replace(",", "."))
  if (!Number.isFinite(number)) return null
  if (number < 0) throw new Error(t("actions.plans.negativeNumber"))
  return number
}
