export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import Link from "next/link"
import { Repeat, ArrowLeft } from "lucide-react"
import { formatMoney, expenseCategoryLabel } from "@/lib/utils"
import { PageHeader, Card } from "@/components/ui/page"
import { DataTable } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { DeleteAction } from "@/components/ui/delete-action"
import { requireOrgAccess } from "@/lib/org"
import { recurringExpenseScope } from "@/lib/tenant-scope"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { safeServerValue } from "@/lib/server-fallback"
import { deleteRecurringExpense } from "@/app/actions/recurring-expenses"
import { RecurringExpenseDialog, RecurringToggle, GenerateRecurringButton } from "./recurring-actions"

function scheduleLabel(months: string | null): string {
  if (!months) return "Каждый месяц"
  return "Только зимой (окт–апр)"
}

export default async function RecurringExpensesPage() {
  const { orgId } = await requireOrgAccess()
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

  const activeCount = templates.filter((t) => t.isActive).length
  const monthlyTotal = templates
    .filter((t) => t.isActive)
    .reduce((sum, t) => sum + t.amount, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Repeat}
        title="Постоянные расходы"
        subtitle="Повторяются автоматически каждый месяц"
        actions={
          <>
            <Link
              href="/admin/finances"
              className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              <ArrowLeft className="h-4 w-4" />
              К финансам
            </Link>
            <GenerateRecurringButton period={currentPeriod} />
            <RecurringExpenseDialog cashAccounts={cashAccounts} buildings={buildingOptions} currentBuildingId={currentBuildingId} />
          </>
        }
      />

      <Card padded={false}>
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Шаблоны ({activeCount} активны)
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            В месяц: <span className="font-medium text-orange-600 dark:text-orange-400">{formatMoney(monthlyTotal)}</span>
          </span>
        </div>
        <DataTable density="compact" className="min-w-[680px]">
          <thead className="bg-slate-50 dark:bg-slate-800/80">
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">Категория</th>
              {!currentBuildingId && <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">Здание</th>}
              <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">Описание</th>
              <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">Повтор</th>
              <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400">Число</th>
              <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400">Сумма</th>
              <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400">Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-slate-50 dark:border-slate-800/50">
                <td className="text-slate-700 dark:text-slate-300">{expenseCategoryLabel(t.category)}</td>
                {!currentBuildingId && <td className="text-slate-500 dark:text-slate-400">{t.building.name}</td>}
                <td className="text-slate-500 dark:text-slate-400">{t.description ?? "—"}</td>
                <td className="text-slate-500 dark:text-slate-400">{scheduleLabel(t.months)}</td>
                <td className="text-center text-slate-500 dark:text-slate-400">{t.dayOfMonth}</td>
                <td className="text-right font-medium text-orange-600 dark:text-orange-400">{formatMoney(t.amount)}</td>
                <td className="text-center"><RecurringToggle id={t.id} isActive={t.isActive} /></td>
                <td className="text-right">
                  <DeleteAction
                    action={deleteRecurringExpense.bind(null, t.id)}
                    entity="постоянный расход"
                    successMessage="Шаблон удалён"
                  />
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={currentBuildingId ? 7 : 8} className="px-5 py-6">
                  <EmptyState
                    icon={<Repeat className="h-5 w-5" />}
                    title="Постоянных расходов нет"
                    description="Добавьте расходы, которые повторяются каждый месяц одинаковой суммой: зарплата, вывоз мусора, техничка, интернет. Для отопления выберите «Только зимой» — оно будет создаваться лишь в октябре–апреле."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </Card>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Расходы создаются автоматически 1-го числа каждого месяца. Переменные расходы (вода, свет) добавляйте вручную на странице «Финансы» — их сумма меняется месяц от месяца.
      </p>
    </div>
  )
}
