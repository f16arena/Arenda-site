export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { getLocale, getT } from "@/lib/i18n/server"
import { formatDateShortL, formatMoneyL, formatPeriodL } from "@/lib/i18n/format"
import { FileSpreadsheet, Wallet, CircleCheck, TrendingDown } from "lucide-react"
// PenaltyButton удалён: пени теперь начисляются только автоматическим cron-ом
// (app/api/cron/check-deadlines/route.ts) с единой формулой и PENALTY_GRACE_DAYS.
// Дублирующая ручная кнопка приводила к рассинхрону (см. AUDIT_2026-05-26.md).
import { PaymentDialog, ExpenseDialog, GenerateChargesButton, GenerateInvoicesButton, VariableExpenseReminder } from "./finance-actions"
import { PaymentReportsPanel } from "./payment-reports-panel"
import { ExportMenu } from "./export-menu"
import { RouteTabs } from "@/components/ui/route-tabs"
import { FINANCE_TABS } from "@/lib/hub-tabs"
import { FinancesPeriodPicker } from "./period-picker"
import { ChargesBulkActions } from "./charges-bulk-actions"
import { PaymentsBulkActions } from "./payments-bulk-actions"
import { DataTable } from "@/components/ui/data-table"
import { DeleteAction } from "@/components/ui/delete-action"
import { EmptyState } from "@/components/ui/empty-state"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { PageHeader, StatGrid, StatCard, Card } from "@/components/ui/page"
import { deleteExpense } from "@/app/actions/finance"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { chargeScope, paymentScope, expenseScope, paymentReportScope } from "@/lib/tenant-scope"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { normalizePage, pageSkip } from "@/lib/pagination"
import { safeServerValue } from "@/lib/server-fallback"
import { measureServerRoute } from "@/lib/server-performance"
import type { Prisma } from "@/app/generated/prisma/client"

const FINANCE_PAGE_SIZE = 10

function readSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

type FinancesPageProps = {
  searchParams?: Promise<{
    chargesPage?: string | string[]
    expensesPage?: string | string[]
    tenantId?: string | string[]
    chargeType?: string | string[]
    chargeStatus?: string | string[]
    period?: string | string[]
  }>
}

// Виды начислений для фильтра: подписи берём из словаря (domain.chargeTypes),
// здесь — только сами значения и их порядок.
const CHARGE_TYPE_FILTERS = [
  "RENT",
  "DEPOSIT",
  "ELECTRICITY",
  "WATER",
  "HEATING",
  "PARKING",
  "PENALTY",
  "OTHER",
]

export default async function FinancesPage(props: FinancesPageProps) {
  return measureServerRoute("/admin/finances", () => renderFinancesPage(props))
}

async function renderFinancesPage({
  searchParams,
}: FinancesPageProps) {
  const { orgId } = await requireOrgAccess()
  const locale = await getLocale()
  const { t } = await getT(locale)
  const money = (amount: number) => formatMoneyL(locale, amount)
  const chargeTypeLabel = (type: string) => {
    if (type === "PARKING") return t("adminFinance.page.charges.parking")
    const key = `domain.chargeTypes.${type}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? type : label
  }
  const expenseCategoryLabel = (category: string) => {
    const key = `adminFinance.expenseCategories.${category}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? category : label
  }
  // Гранулярные права: каждая кнопка показывается только при наличии своего права.
  // OWNER/платформенный админ получают все права (минус заблокированные тарифом).
  const session = await auth()
  const caps = session?.user
    ? new Set(await getAllowedCapabilityKeysForUser({
        userId: session.user.id,
        role: session.user.role,
        isPlatformOwner: !!session.user.isPlatformOwner,
        orgId,
      }))
    : new Set<string>()
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/finances", orgId })
  const resolvedSearchParams = await searchParams
  const chargesPage = normalizePage(resolvedSearchParams?.chargesPage)
  const expensesPage = normalizePage(resolvedSearchParams?.expensesPage)
  const selectedTenantId = readSearchParam(resolvedSearchParams?.tenantId)
  const rawChargeType = readSearchParam(resolvedSearchParams?.chargeType).toUpperCase()
  const validChargeTypes = new Set(CHARGE_TYPE_FILTERS)
  const selectedChargeType = validChargeTypes.has(rawChargeType) ? rawChargeType : ""
  const rawChargeStatus = readSearchParam(resolvedSearchParams?.chargeStatus).toLowerCase()
  const selectedChargeStatus = ["paid", "unpaid"].includes(rawChargeStatus) ? rawChargeStatus : ""
  // Период можно выбрать через ?period=YYYY-MM (по умолчанию текущий месяц) —
  // чтобы смотреть/отменять пени и начисления прошлых месяцев.
  const rawPeriod = readSearchParam(resolvedSearchParams?.period)
  const currentPeriod = /^\d{4}-\d{2}$/.test(rawPeriod) ? rawPeriod : new Date().toISOString().slice(0, 7) // YYYY-MM
  const currentBuildingId = await getCurrentBuildingId()
  if (currentBuildingId) await assertBuildingInOrg(currentBuildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = currentBuildingId ? [currentBuildingId] : accessibleBuildingIds
  // Арендатор здания — любым из 4 путей привязки. Раньше учитывались только
  // основное помещение и этаж целиком: начисления и оплаты арендаторов с
  // несколькими помещениями и мест без помещения (киоск) сюда не попадали.
  const tenantBuildingWhere = {
    OR: [
      { space: { floor: { buildingId: { in: visibleBuildingIds } } } },
      { tenantSpaces: { some: { space: { floor: { buildingId: { in: visibleBuildingIds } } } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
      { buildingId: { in: visibleBuildingIds } },
    ],
  }

  // Активные cash-аккаунты для выпадашки в диалогах
  const [cashAccounts, buildingOptions] = await Promise.all([
    safe(
      "admin.finances.cashAccounts",
      db.cashAccount.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, name: true, type: true },
        orderBy: [{ type: "asc" }, { createdAt: "asc" }],
      }),
      [],
    ),
    safe(
      "admin.finances.buildingOptions",
      db.building.findMany({
        where: { id: { in: visibleBuildingIds }, organizationId: orgId, isActive: true },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
      [],
    ),
  ])

  const baseChargesWhere: Prisma.ChargeWhereInput = {
    AND: [chargeScope(orgId), { period: currentPeriod }, { tenant: tenantBuildingWhere }],
  }
  const filteredChargesWhere: Prisma.ChargeWhereInput = {
    AND: [
      baseChargesWhere,
      ...(selectedChargeType ? [{ type: selectedChargeType } as Prisma.ChargeWhereInput] : []),
      ...(selectedChargeStatus === "paid"
        ? [{ isPaid: true } as Prisma.ChargeWhereInput]
        : selectedChargeStatus === "unpaid"
          ? [{ isPaid: false } as Prisma.ChargeWhereInput]
          : []),
    ],
  }
  // Используем filtered для пагинированного списка, base — для агрегатов и диалогов
  const chargesWhere = filteredChargesWhere
  // Возврат депозита (DEPOSIT_REFUND, isPaid=true) — деньги «из кассы», а не доход:
  // в суммы «начислено/оплачено/не оплачено» не входит (в списке остаётся виден).
  const sumChargesWhere: Prisma.ChargeWhereInput = {
    AND: [baseChargesWhere, { type: { not: "DEPOSIT_REFUND" } }],
  }
  const unpaidChargesWhere: Prisma.ChargeWhereInput = {
    AND: [sumChargesWhere, { isPaid: false }],
  }
  const paidChargesWhere: Prisma.ChargeWhereInput = {
    AND: [sumChargesWhere, { isPaid: true }],
  }
  const expensesWhere: Prisma.ExpenseWhereInput = {
    AND: [expenseScope(orgId), { period: currentPeriod }, { buildingId: { in: visibleBuildingIds } }],
  }

  const [
    charges,
    payments,
    expenses,
    paymentReports,
    chargesAggregate,
    paidChargesAggregate,
    unpaidChargesAggregate,
    expensesAggregate,
    dialogCharges,
    selectedPaymentTenant,
  ] = await Promise.all([
    safe(
      "admin.finances.charges",
      db.charge.findMany({
        where: chargesWhere,
        select: {
          id: true, tenantId: true, period: true, type: true, amount: true,
          description: true, isPaid: true, dueDate: true, createdAt: true,
          tenant: { select: { id: true, companyName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: pageSkip(chargesPage, FINANCE_PAGE_SIZE),
        take: FINANCE_PAGE_SIZE,
      }),
      [],
    ),
    safe(
      "admin.finances.payments",
      db.payment.findMany({
        where: { AND: [paymentScope(orgId), { tenant: tenantBuildingWhere }] },
        orderBy: { paymentDate: "desc" },
        take: 20,
        select: {
          id: true, tenantId: true, amount: true, method: true,
          paymentDate: true, note: true,
          tenant: { select: { id: true, companyName: true } },
        },
      }),
      [],
    ),
    safe(
      "admin.finances.expenses",
      db.expense.findMany({
        where: expensesWhere,
        select: {
          id: true, buildingId: true, category: true, amount: true,
          period: true, description: true, date: true,
          building: { select: { name: true } },
        },
        orderBy: { date: "desc" },
        skip: pageSkip(expensesPage, FINANCE_PAGE_SIZE),
        take: FINANCE_PAGE_SIZE,
      }),
      [],
    ),
    safe(
      "admin.finances.paymentReports",
      db.paymentReport.findMany({
        where: {
          AND: [
            paymentReportScope(orgId),
            { status: { in: ["PENDING", "DISPUTED"] } },
            { tenant: tenantBuildingWhere },
          ],
        },
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          method: true,
          status: true,
          paymentPurpose: true,
          note: true,
          receiptName: true,
          receiptMime: true,
          receiptDataUrl: true,
          receiptFileId: true,
          createdAt: true,
          tenant: {
            select: {
              id: true,
              companyName: true,
              charges: {
                where: { deletedAt: null, isPaid: false },
                select: {
                  id: true,
                  type: true,
                  amount: true,
                  period: true,
                  description: true,
                },
                orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
                take: 6,
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      [],
    ),
    safe(
      "admin.finances.chargesAggregate",
      db.charge.aggregate({
        // Без явного фильтра по типу возвраты депозита в сумму «начислено» не входят.
        where: selectedChargeType ? filteredChargesWhere : { AND: [filteredChargesWhere, { type: { not: "DEPOSIT_REFUND" } }] },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      { _sum: { amount: 0 }, _count: { _all: 0 } },
    ),
    safe(
      "admin.finances.paidChargesAggregate",
      db.charge.aggregate({
        where: paidChargesWhere,
        _sum: { amount: true },
      }),
      { _sum: { amount: 0 } },
    ),
    safe(
      "admin.finances.unpaidChargesAggregate",
      db.charge.aggregate({
        where: unpaidChargesWhere,
        _sum: { amount: true },
      }),
      { _sum: { amount: 0 } },
    ),
    safe(
      "admin.finances.expensesAggregate",
      db.expense.aggregate({
        where: expensesWhere,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      { _sum: { amount: 0 }, _count: { _all: 0 } },
    ),
    safe(
      "admin.finances.dialogCharges",
      db.charge.findMany({
        where: unpaidChargesWhere,
        select: {
          id: true, tenantId: true, period: true, type: true, amount: true,
          description: true, isPaid: true,
          tenant: { select: { id: true, companyName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      [],
    ),
    selectedTenantId
      ? safe(
          "admin.finances.selectedPaymentTenant",
          db.tenant.findFirst({
            where: {
              id: selectedTenantId,
              user: { organizationId: orgId },
              ...tenantBuildingWhere,
            },
            select: { id: true, companyName: true },
          }),
          null as { id: string; companyName: string } | null,
        )
      : Promise.resolve(null),
  ])

  // Переменные расходы (вода/свет, зимой — отопление): вносятся вручную каждый
  // месяц, т.к. сумма меняется. Считаем, что уже внесено за период, и берём
  // прошлый месяц как ориентир.
  const currentMonthNum = Number(currentPeriod.split("-")[1])
  const isWinterMonth = [10, 11, 12, 1, 2, 3, 4].includes(currentMonthNum)
  const variableCats = isWinterMonth ? ["ELECTRICITY", "WATER", "HEATING"] : ["ELECTRICITY", "WATER"]
  const prevDateForRef = new Date(Number(currentPeriod.split("-")[0]), currentMonthNum - 2, 1)
  const prevPeriod = `${prevDateForRef.getFullYear()}-${String(prevDateForRef.getMonth() + 1).padStart(2, "0")}`
  const variableWhere = (period: string): Prisma.ExpenseWhereInput => ({
    AND: [expenseScope(orgId), { period }, { buildingId: { in: visibleBuildingIds } }, { category: { in: variableCats } }],
  })
  const [curVarRows, prevVarRows] = await Promise.all([
    safe(
      "admin.finances.variableCurrent",
      db.expense.groupBy({ by: ["category"], where: variableWhere(currentPeriod), _sum: { amount: true }, _count: { _all: true } }),
      [] as Array<{ category: string; _sum: { amount: number | null }; _count: { _all: number } }>,
    ),
    safe(
      "admin.finances.variablePrev",
      db.expense.groupBy({ by: ["category"], where: variableWhere(prevPeriod), _sum: { amount: true } }),
      [] as Array<{ category: string; _sum: { amount: number | null } }>,
    ),
  ])
  const enteredVarCats = new Set(curVarRows.filter((r) => (r._count?._all ?? 0) > 0).map((r) => r.category))
  const prevVarMap = new Map(prevVarRows.map((r) => [r.category, r._sum.amount ?? 0]))
  const variableExpenseItems = variableCats.map((cat) => ({
    category: cat,
    entered: enteredVarCats.has(cat),
    lastAmount: prevVarMap.get(cat) ?? null,
  }))

  const totalCharges = chargesAggregate._sum.amount ?? 0
  const paidCharges = paidChargesAggregate._sum.amount ?? 0
  const unpaidCharges = unpaidChargesAggregate._sum.amount ?? 0
  const totalExpenses = expensesAggregate._sum.amount ?? 0
  // Собираемость: оплачено / (оплачено + долг) — не зависит от фильтра по типу.
  const billedForRate = paidCharges + unpaidCharges
  const collectionRate = billedForRate > 0 ? Math.round((paidCharges / billedForRate) * 100) : 0
  const totalChargeCount = chargesAggregate._count._all
  const totalExpenseCount = expensesAggregate._count._all
  // Арендатор назван row, а не t: иначе перекрывает переводчик t.
  const dialogTenantOptions = dialogCharges
    .map((c) => c.tenant)
    .filter((row, i, arr) => arr.findIndex((x) => x.id === row.id) === i)
    .map((row) => ({ id: row.id, companyName: row.companyName }))
  if (selectedPaymentTenant && !dialogTenantOptions.some((tenant) => tenant.id === selectedPaymentTenant.id)) {
    dialogTenantOptions.push(selectedPaymentTenant)
  }

  return (
    <div className="space-y-5">
      <RouteTabs items={FINANCE_TABS} className="mb-2" />
      <PageHeader
        icon={Wallet}
        title={t("adminFinance.page.title")}
        subtitle={t("adminFinance.page.subtitle", { period: formatPeriodL(locale, currentPeriod) })}
        actions={
          <>
            <FinancesPeriodPicker period={currentPeriod} />
            <ExportMenu
              period={currentPeriod}
              canZip={caps.has("finance.exportZip")}
              can1c={caps.has("finance.export1c")}
              canExcel={caps.has("finance.export")}
              canImport={caps.has("finance.importBank")}
            />
            {caps.has("finance.recordPayment") && (
              <PaymentDialog
                tenants={dialogTenantOptions}
                unpaidCharges={dialogCharges.map((c) => ({ id: c.id, tenantId: c.tenantId, type: chargeTypeLabel(c.type), amount: c.amount, description: c.description, period: c.period, isPaid: c.isPaid }))}
                cashAccounts={cashAccounts}
                initialTenantId={selectedPaymentTenant?.id}
                autoOpen={Boolean(selectedPaymentTenant)}
              />
            )}
          </>
        }
      />

      <PaymentReportsPanel reports={paymentReports} cashAccounts={cashAccounts} />

      {/* Summary cards */}
      <StatGrid>
        <StatCard
          icon={FileSpreadsheet}
          label={t("adminFinance.page.stats.accrued")}
          value={money(totalCharges)}
          sub={t("adminFinance.page.stats.accruedSub")}
          tone="blue"
        />
        <StatCard
          icon={CircleCheck}
          label={t("adminFinance.page.stats.paid")}
          value={money(paidCharges)}
          sub={t("adminFinance.page.stats.paidSub", { percent: collectionRate })}
          tone="emerald"
        />
        <StatCard
          icon={Wallet}
          label={t("adminFinance.page.stats.debt")}
          value={money(unpaidCharges)}
          sub={t("adminFinance.page.stats.debtSub")}
          tone={unpaidCharges > 0 ? "red" : "slate"}
        />
        <StatCard
          icon={TrendingDown}
          label={t("adminFinance.page.stats.expenses")}
          value={money(totalExpenses)}
          sub={t("adminFinance.page.stats.expensesSub")}
          tone="amber"
        />
      </StatGrid>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Charges */}
        <Card padded={false}>
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("adminFinance.page.charges.title", { period: formatPeriodL(locale, currentPeriod) })}
              </h2>
              {caps.has("finance.createInvoice") && (
                <div className="flex flex-wrap items-center gap-2">
                  <GenerateChargesButton period={currentPeriod} />
                  {totalChargeCount > 0 && <GenerateInvoicesButton period={currentPeriod} />}
                </div>
              )}
            </div>
            <form className="flex flex-wrap items-center gap-2" action="/admin/finances">
              <input type="hidden" name="period" value={currentPeriod} />
              {selectedTenantId && <input type="hidden" name="tenantId" value={selectedTenantId} />}
              <select name="chargeType" defaultValue={selectedChargeType} aria-label={t("adminFinance.page.charges.typeLabel")} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <option value="">{t("adminFinance.page.charges.typeAll")}</option>
                {CHARGE_TYPE_FILTERS.map((type) => <option key={type} value={type}>{chargeTypeLabel(type)}</option>)}
              </select>
              <select name="chargeStatus" defaultValue={selectedChargeStatus} aria-label={t("adminFinance.page.charges.statusLabel")} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <option value="">{t("adminFinance.page.charges.statusAll")}</option>
                <option value="paid">{t("adminFinance.page.charges.statusPaid")}</option>
                <option value="unpaid">{t("adminFinance.page.charges.statusUnpaid")}</option>
              </select>
              <button type="submit" className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">{t("adminFinance.page.charges.apply")}</button>
            </form>
          </div>
          {charges.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet className="h-5 w-5" />}
              title={t("adminFinance.page.charges.emptyTitle")}
              description={t("adminFinance.page.charges.emptyText")}
              actions={[
                { href: "/admin/tenants", label: t("adminFinance.page.charges.emptyTenants") },
                { href: "/admin/data-quality", label: t("adminFinance.page.charges.emptyQuality"), variant: "secondary" },
              ]}
            />
          ) : (
            <ChargesBulkActions
              canMarkPaid={caps.has("finance.recordPayment")}
              canDelete={caps.has("finance.deleteRecords")}
              charges={charges.map((c) => ({
                id: c.id,
                tenantName: c.tenant.companyName,
                type: c.type,
                amount: c.amount,
                isPaid: c.isPaid,
              }))}
            />
          )}
          <PaginationControls
            basePath="/admin/finances"
            page={chargesPage}
            pageSize={FINANCE_PAGE_SIZE}
            total={totalChargeCount}
            pageParam="chargesPage"
            params={{
              expensesPage: expensesPage > 1 ? expensesPage : null,
              chargeType: selectedChargeType || null,
              chargeStatus: selectedChargeStatus || null,
              tenantId: selectedTenantId || null,
            }}
          />
        </Card>

        {/* Payments */}
        <Card padded={false} title={t("adminFinance.page.payments.title")}>
          {payments.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-5 w-5" />}
              title={t("adminFinance.page.payments.emptyTitle")}
              description={t("adminFinance.page.payments.emptyText")}
              actions={[
                { href: "/admin/finances/balance", label: t("adminFinance.page.payments.emptyBalance") },
                { href: "/admin/faq", label: t("adminFinance.page.payments.emptyFaq"), variant: "secondary" },
              ]}
            />
          ) : (
            <PaymentsBulkActions
              canDelete={caps.has("finance.deleteRecords")}
              payments={payments.slice(0, 10).map((p) => ({
                id: p.id,
                tenantName: p.tenant.companyName,
                amount: p.amount,
                method: p.method,
                paymentDate: p.paymentDate,
              }))}
            />
          )}
        </Card>
      </div>

      {/* Expenses */}
      <Card
        padded={false}
        title={t("adminFinance.page.expenses.title")}
        actions={caps.has("finance.manageExpenses") ? <ExpenseDialog cashAccounts={cashAccounts} buildings={buildingOptions} currentBuildingId={currentBuildingId} /> : undefined}
      >
        <div className="border-b border-slate-100 p-4 empty:hidden dark:border-slate-800">
      <VariableExpenseReminder
            items={variableExpenseItems}
            cashAccounts={cashAccounts}
            buildings={buildingOptions}
            currentBuildingId={currentBuildingId}
            period={currentPeriod}
          />
        </div>
        <DataTable density="compact" className="min-w-[640px]">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 backdrop-blur supports-[backdrop-filter]:bg-slate-50/95 supports-[backdrop-filter]:dark:bg-slate-800/70">
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.page.expenses.category")}</th>
              {!currentBuildingId && <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.page.expenses.building")}</th>}
              <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.page.expenses.description")}</th>
              <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.page.expenses.date")}</th>
              <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminFinance.page.expenses.amount")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-b border-slate-50">
                <td className="text-slate-700 dark:text-slate-300">{expenseCategoryLabel(e.category)}</td>
                {!currentBuildingId && (
                  <td className="text-slate-500 dark:text-slate-400">{e.building.name}</td>
                )}
                <td className="text-slate-500 dark:text-slate-400">{e.description ?? "—"}</td>
                <td className="text-slate-500 dark:text-slate-400">{formatDateShortL(locale, e.date)}</td>
                <td className="text-right font-medium text-orange-600 dark:text-orange-400">{money(e.amount)}</td>
                <td className="text-right">
                  <DeleteAction
                    action={deleteExpense.bind(null, e.id)}
                    entity={t("adminFinance.page.expenses.entity")}
                    successMessage={t("adminFinance.page.expenses.deleted")}
                  />
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={currentBuildingId ? 5 : 6} className="px-5 py-6">
                  <EmptyState
                    icon={<Wallet className="h-5 w-5" />}
                    title={t("adminFinance.page.expenses.emptyTitle")}
                    description={t("adminFinance.page.expenses.emptyText")}
                    actions={[
                      { href: "/admin/analytics", label: t("adminFinance.page.expenses.emptyAnalytics") },
                      { href: "/admin/finances/balance", label: t("adminFinance.page.expenses.emptyBalance"), variant: "secondary" },
                    ]}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
        <PaginationControls
          basePath="/admin/finances"
          page={expensesPage}
          pageSize={FINANCE_PAGE_SIZE}
          total={totalExpenseCount}
          pageParam="expensesPage"
          params={{ chargesPage: chargesPage > 1 ? chargesPage : null }}
        />
      </Card>
    </div>
  )
}
