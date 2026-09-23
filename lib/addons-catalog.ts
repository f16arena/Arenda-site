/**
 * Каталог аддонов, которые клиент может «заказать» у супер-админа.
 * Заявка создаёт OrganizationAddon(isActive=false) + уведомляет супер-админа.
 *
 * `code` уходит в базу (OrganizationAddon.addonCode) — не переводится.
 * Подписи для кабинета клиента берутся из словаря (adminRefs.addons.<код>),
 * см. localizedAddonsForPlan.
 */

import type { Messages } from "@/lib/i18n/messages"
import type { Translator } from "@/lib/i18n/translate"

export type AddonCatalogItem = {
  code: string
  label: string
  description: string
  priceMonthly: number
  requiresPlan?: string[] // если undefined — доступно на любом платном
}

export const ADDON_CATALOG: AddonCatalogItem[] = [
  { code: "BUILDING_STARTER", label: "+1 здание (Starter)", description: "Дополнительное здание сверх лимита тарифа Starter", priceMonthly: 2_500, requiresPlan: ["STARTER"] },
  { code: "BUILDING_PRO", label: "+1 здание (Pro)", description: "Дополнительное здание сверх лимита тарифа Pro", priceMonthly: 1_500, requiresPlan: ["PRO"] },
  { code: "BUILDING_BUSINESS", label: "+1 здание (Business)", description: "Дополнительное здание сверх лимита тарифа Business", priceMonthly: 990, requiresPlan: ["BUSINESS"] },
  { code: "TENANTS_25", label: "+25 арендаторов", description: "Увеличивает лимит арендаторов на 25", priceMonthly: 2_900 },
  { code: "STORAGE_25GB", label: "+25 ГБ хранилища", description: "Увеличивает квоту облачного хранилища на 25 ГБ", priceMonthly: 1_500 },
  { code: "USER", label: "+1 пользователь", description: "Дополнительный пользователь панели", priceMonthly: 1_500 },
  { code: "WHITELABEL_CABINET", label: "Брендированный кабинет арендатора", description: "Логотип и фирменные цвета в кабинете арендатора (Business+).", priceMonthly: 14_900, requiresPlan: ["BUSINESS", "ENTERPRISE"] },
]

export function addonsForPlan(planCode: string | null | undefined): AddonCatalogItem[] {
  if (!planCode || planCode === "FREE") return []
  return ADDON_CATALOG.filter((a) => !a.requiresPlan || a.requiresPlan.includes(planCode))
}

type RefsTranslator = Translator<Messages>["t"]

function refText(t: RefsTranslator, key: string, fallback: string): string {
  const value = t(key as Parameters<RefsTranslator>[0])
  return value === key ? fallback : value
}

/** Тот же каталог, но с подписями на языке клиента — для страницы подписки. */
export function localizedAddonsForPlan(t: RefsTranslator, planCode: string | null | undefined): AddonCatalogItem[] {
  return addonsForPlan(planCode).map((item) => ({
    ...item,
    label: refText(t, `adminRefs.addons.${item.code}.label`, item.label),
    description: refText(t, `adminRefs.addons.${item.code}.description`, item.description),
  }))
}
