export const dynamic = "force-dynamic"

import { RouteTabs } from "@/components/ui/route-tabs"
import { financeTabs } from "@/lib/hub-tabs"
import { db } from "@/lib/db"
import Link from "next/link"
import { Repeat, ArrowLeft } from "lucide-react"
import { getLocale, getT } from "@/lib/i18n/server"
import { formatMoneyL, formatPeriodL } from "@/lib/i18n/format"
import { PageHeader, Card } from "@/components/ui/page"
import { DataTable } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { DeleteAction } from "@/components/ui/delete-action"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { recurringExpenseScope } from "@/lib/tenant-scope"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { safeServerValue } from "@/lib/server-fallback"
import { deleteRecurringExpense } from "@/app/actions/recurring-expenses"
import { RecurringExpenseDialog, RecurringToggle, GenerateRecurringButton } from "./recurring-actions"

export default async function RecurringExpensesPage() {
  const { orgId } = await requireOrgAccess()
  const locale = await getLocale()
  const { t } = await getT(locale)
  const money = (amount: number) => formatMoneyL(locale, amount)
  // Повтор: либо каждый месяц, либо «только зимой» (months задан).
  const scheduleLabel = (months: string | null) =>
    months ? t("adminFinance.recurring.winterOnly") : t("adminFinance.recurring.everyMonth")
  const categoryLabel = (category: string) => {
    const key = `adminFinance.expenseCategories.${category}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? category : label
  }
  const session = await auth()
  const caps = session?.user
    ? new Set(await getAllowedCapabilityKeysForUser({
        userId: session.user.id,
        role: session.user.role,
        isPlatformOwner: !!session.user.isPlatformOwner,
        orgId,
      }))
    : new Set<string>()
  const canManage = caps.has("finance.manageExpenses")
  const currentPeriod = new Date().toISOString().slice(0, 7)
  const currentBuildingId = await getCurrentBuildingId()
  if (currentBuildingId) await assertBuildingInOrg(currentBuildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = currentBuildingId ? [currentBuildingId] : accessibleBuildingIds

  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/finances/recurring", orgId })

  const [templates, cashAccounts, buildingOptions] = await Promise.all([
    safe(
      "admin.finances.recurring.templates",
      db.recurringExpense.findMany({
        where: { AND: [recurringExpenseScope(orgId), { buildingId: { in: visibleBuildingIds } }] },
        select: {
          id: true, category: true, amount: true, description: true,
          dayOfMonth: true, months: true, isActive: true, cashAccountId: true,
          building: { select: { name: true } },
        },
        orderBy: [{ isActive: "desc" }, { category: "asc" }],
        take: 100,
      }),
      [],
    ),
    safe(
      "admin.finances.recurring.cashAccounts",
      db.cashAccount.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, name: true, type: true },
        orderBy: [{ type: "asc" }, { createdAt: "asc" }],
      }),
      [],
    ),
    safe(
      "admin.finances.recurring.buildings",
      db.building.findMany({
        where: { id: { in: visibleBuildingIds }, organizationId: orgId, isActive: true },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
      [],
    ),
  ])

  // Шаблон в колбэках назван row, а не t: иначе перекрывает переводчик.
  const activeCount = templates.filter((row) => row.isActive).length
  const monthlyTotal = templates
    .filter((row) => row.isActive)
    .reduce((sum, row) => sum + row.amount, 0)

  return (
    <div className="space-y-5">
      <RouteTabs items={financeTabs(t)} className="mb-2" />
      <PageHeader
        icon={Repeat}
        title={t("adminFinance.recurring.title")}
        subtitle={t("adminFinance.recurring.subtitle")}
        actions={
          <>
            <Link
              href="/admin/finances"
              className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("adminFinance.recurring.toFinances")}
            </Link>
            {canManage && <GenerateRecurringButton period={currentPeriod} periodLabel={formatPeriodL(locale, currentPeriod)} />}
            {canManage && <RecurringExpenseDialog cashAccounts={cashAccounts} buildings={buildingOptions} currentBuildingId={currentBuildingId} />}
          </>
        }
      />

      <Card padded={false}>
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("adminFinance.recurring.templates", { count: activeCount })}
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t("adminFinance.recurring.monthlyTotal")}{" "}
            <span className="font-medium text-orange-600 dark:text-orange-400">{money(monthlyTotal)}</span>
          </span>
        </div>
        <DataTable density="compact" className="min-w-[680px]">
          <thead className="bg-slate-50 dark:bg-slate-800/80">
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.recurring.category")}</th>
              {!currentBuildingId && <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.recurring.building")}</th>}
              <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.recurring.description")}</th>
              <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.recurring.schedule")}</th>
              <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.recurring.dayOfMonth")}</th>
              <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.recurring.amount")}</th>
              <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.recurring.status")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {templates.map((row) => (
              <tr key={row.id} className="border-b border-slate-50 dark:border-slate-800/50">
                <td className="text-slate-700 dark:text-slate-300">{categoryLabel(row.category)}</td>
                {!currentBuildingId && <td className="text-slate-500 dark:text-slate-400">{row.building.name}</td>}
                <td className="text-slate-500 dark:text-slate-400">{row.description ?? "—"}</td>
                <td className="text-slate-500 dark:text-slate-400">{scheduleLabel(row.months)}</td>
                <td className="text-center text-slate-500 dark:text-slate-400">{row.dayOfMonth}</td>
                <td className="text-right font-medium text-orange-600 dark:text-orange-400">{money(row.amount)}</td>
                <td className="text-center">
                  {canManage ? (
                    <RecurringToggle id={row.id} isActive={row.isActive} />
                  ) : (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {row.isActive ? t("adminFinance.recurring.active") : t("adminFinance.recurring.paused")}
                    </span>
                  )}
                </td>
                <td className="text-right">
                  {canManage && (
                    <DeleteAction
                      action={deleteRecurringExpense.bind(null, row.id)}
                      entity={t("adminFinance.recurring.entity")}
                      successMessage={t("adminFinance.recurring.deleted")}
                    />
                  )}
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={currentBuildingId ? 7 : 8} className="px-5 py-6">
                  <EmptyState
                    icon={<Repeat className="h-5 w-5" />}
                    title={t("adminFinance.recurring.emptyTitle")}
                    description={t("adminFinance.recurring.emptyText")}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </Card>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        {t("adminFinance.recurring.footnote")}
      </p>
    </div>
  )
}
