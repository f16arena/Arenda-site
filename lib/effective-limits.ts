/**
 * Подсчёт эффективных лимитов с учётом активных аддонов.
 *
 * Архитектура: Plan задаёт базовый лимит (maxBuildings, maxTenants, ...).
 * Аддоны (OrganizationAddon) суммируются по quantity к этому лимиту, если
 * isActive=true и (expiresAt отсутствует ИЛИ в будущем).
 *
 * Маппинг addonCode → к какому лимиту прибавлять (см. lib/addons-catalog.ts):
 *   BUILDING_STARTER, BUILDING_PRO, BUILDING_BUSINESS → buildings
 *   TENANTS_25                                         → tenants (×25)
 *   USER                                               → users
 *   STORAGE_25GB                                       → storageGb (×25)
 */
import { db } from "@/lib/db"

export type EffectiveLimitType = "buildings" | "tenants" | "users" | "leads" | "storageGb"

const BUILDING_ADDONS = new Set(["BUILDING_STARTER", "BUILDING_PRO", "BUILDING_BUSINESS"])
const TENANT_ADDONS = new Set(["TENANTS_25"])   // 1 unit квоты = 25 арендаторов
const USER_ADDONS = new Set(["USER"])
const STORAGE_ADDONS = new Set(["STORAGE_25GB"]) // 1 unit квоты = 25 ГБ

type AddonRow = {
  addonCode: string
  quantity: number
  isActive: boolean
  expiresAt: Date | null
}

/**
 * Возвращает суммарную надбавку к лимиту от активных аддонов.
 * Не выполняет проверок — просто складывает quantity * multiplier.
 */
export function addonBonusFor(type: EffectiveLimitType, addons: AddonRow[]): number {
  const now = Date.now()
  let bonus = 0
  for (const a of addons) {
    if (!a.isActive) continue
    if (a.expiresAt && a.expiresAt.getTime() < now) continue
    const qty = Math.max(0, Math.floor(a.quantity || 0))
    if (qty <= 0) continue
    if (type === "buildings" && BUILDING_ADDONS.has(a.addonCode)) bonus += qty
    else if (type === "tenants" && TENANT_ADDONS.has(a.addonCode)) bonus += qty * 25
    else if (type === "users" && USER_ADDONS.has(a.addonCode)) bonus += qty
    else if (type === "storageGb" && STORAGE_ADDONS.has(a.addonCode)) bonus += qty * 25
  }
  return bonus
}

/**
 * Эффективный лимит = базовый из плана + бонус от аддонов.
 * Возвращает null если базовый лимит null (безлимит) — тогда аддоны бессмысленны.
 */
export function effectiveLimit(planMax: number | null | undefined, type: EffectiveLimitType, addons: AddonRow[]): number | null {
  if (planMax === null || planMax === undefined) return null
  return planMax + addonBonusFor(type, addons)
}

/**
 * Загружает активные аддоны организации одним запросом.
 * isActive=true, не просроченные. Используется в checkLimit и storage.ts.
 */
export async function getActiveAddons(organizationId: string): Promise<AddonRow[]> {
  return db.organizationAddon.findMany({
    where: { organizationId, isActive: true },
    select: { addonCode: true, quantity: true, isActive: true, expiresAt: true },
  })
}
