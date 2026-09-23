// Хабы редизайна (этап 1, docs/REDESIGN-PLAN.md): связанные страницы выглядят
// одним разделом со вкладками (components/ui/route-tabs). Одна задача — одно
// место входа; роуты и права страниц сохраняются.
//
// Здесь только маршруты и порядок. Подписи живут в словаре
// (adminRefs.tabs.*): вкладки рисуются на 17 страницах, и держать их текст
// рядом с роутом значило бы держать его на одном языке.

import type { Messages } from "@/lib/i18n/messages"
import type { Translator } from "@/lib/i18n/translate"

/** Переводчик страницы: const { t } = await getT() в серверном компоненте. */
type TabsTranslator = Translator<Messages>["t"]

export type RouteTab = { href: string; label: string }

export function teamTabs(t: TabsTranslator): RouteTab[] {
  return [
    { href: "/admin/staff", label: t("adminRefs.tabs.team.staff") },
    { href: "/admin/users", label: t("adminRefs.tabs.team.users") },
    { href: "/admin/roles", label: t("adminRefs.tabs.team.roles") },
  ]
}

export function healthTabs(t: TabsTranslator): RouteTab[] {
  return [
    { href: "/admin/onboarding", label: t("adminRefs.tabs.health.onboarding") },
    { href: "/admin/data-quality", label: t("adminRefs.tabs.health.dataQuality") },
    { href: "/admin/system-health", label: t("adminRefs.tabs.health.systemHealth") },
  ]
}

export function documentsTabs(t: TabsTranslator): RouteTab[] {
  return [
    { href: "/admin/documents", label: t("adminRefs.tabs.documents.all") },
    { href: "/admin/contracts", label: t("adminRefs.tabs.documents.contracts") },
  ]
}

export function importTabs(t: TabsTranslator): RouteTab[] {
  return [
    { href: "/admin/import/tenants", label: t("adminRefs.tabs.importData.tenants") },
    { href: "/admin/import/contracts", label: t("adminRefs.tabs.importData.contracts") },
    { href: "/admin/import/charges", label: t("adminRefs.tabs.importData.charges") },
    { href: "/admin/finances/import", label: t("adminRefs.tabs.importData.payments") },
  ]
}

// История: что делали люди и что ушло арендаторам на почту. Раньше это были
// два отдельных пункта меню — «Журнал операций» и «Журнал email».
export function historyTabs(t: TabsTranslator): RouteTab[] {
  return [
    { href: "/admin/audit", label: t("adminRefs.tabs.history.actions") },
    { href: "/admin/email-logs", label: t("adminRefs.tabs.history.emails") },
  ]
}

export function serviceTabs(t: TabsTranslator): RouteTab[] {
  return [
    { href: "/admin/requests", label: t("adminRefs.tabs.service.requests") },
    { href: "/admin/complaints", label: t("adminRefs.tabs.service.complaints") },
  ]
}

// Финансы: месяц (начисления, оплаты, расходы) + разделы, которые раньше были
// шестью разноцветными кнопками в шапке страницы.
export function financeTabs(t: TabsTranslator): RouteTab[] {
  return [
    { href: "/admin/finances", label: t("adminRefs.tabs.finance.month") },
    { href: "/admin/finances/deposits", label: t("adminRefs.tabs.finance.deposits") },
    { href: "/admin/finances/installments", label: t("adminRefs.tabs.finance.installments") },
    { href: "/admin/finances/recurring", label: t("adminRefs.tabs.finance.recurring") },
    { href: "/admin/finances/balance", label: t("adminRefs.tabs.finance.balance") },
  ]
}
