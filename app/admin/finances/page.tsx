export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { formatMoney, formatPeriod, CHARGE_TYPES, expenseCategoryLabel } from "@/lib/utils"
import { FileSpreadsheet, ShieldCheck, Upload, Wallet, CircleCheck, TrendingDown, Repeat } from "lucide-react"
import Link from "next/link"
// PenaltyButton удалён: пени теперь начисляются только автоматическим cron-ом
// (app/api/cron/check-deadlines/route.ts) с единой формулой и PENALTY_GRACE_DAYS.
// Дублирующая ручная кнопка приводила к рассинхрону (см. AUDIT_2026-05-26.md).
import { PaymentDialog, ExpenseDialog, GenerateChargesButton, GenerateInvoicesButton } from "./finance-actions"
import { PaymentReportsPanel } from "./payment-reports-panel"
import { BatchBillingButton } from "./batch-billing-button"
import { ChargesBulkActions } from "./charges-bulk-actions"
import { PaymentsBulkActions } from "./payments-bulk-actions"
import { DataTable } from "@/components/ui/data-table"
import { DeleteAction } from "@/components/ui/delete-action"
import { EmptyState } from "@/components/ui/empty-state"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { PageHeader, StatGrid, StatCard, Card } from "@/components/ui/page"
import { deleteExpense } from "@/app/actions/finance"
import { requireOrgAccess } from "@/lib/org"
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
  }>
}

const CHARGE_TYPE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Все типы" },
  { value: "RENT", label: "Аренда" },
  { value: "DEPOSIT", label: "Депозит" },
  { value: "ELECTRICITY", label: "Электричество" },
  { value: "WATER", label: "Вода" },
  { value: "HEATING", label: "Отопление" },
  { value: "PARKING", label: "Парковка" },
  { value: "PENALTY", label: "Пени" },
  { value: "OTHER", label: "Прочее" },
]
const CHARGE_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Все" },
  { value: "paid", label: "Оплачено" },
  { value: "unpaid", label: "Не оплачено" },
]

export default async function FinancesPage(props: FinancesPageProps) {
  return measureServerRoute("/admin/finances", () => renderFinancesPage(props))
}

async function renderFinancesPage({
  searchParams,
}: FinancesPageProps) {
  const { orgId } = await requireOrgAccess()
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/finances", orgId })
  const resolvedSearchParams = await searchParams
  const chargesPage = normalizePage(resolvedSearchParams?.chargesPage)
  const expensesPage = normalizePage(resolvedSearchParams?.expensesPage)
  const selectedTenantId = readSearchParam(resolvedSearchParams?.tenantId)
  const rawChargeType = readSearchParam(resolvedSearchParams?.chargeType).toUpperCase()
  const validChargeTypes = new Set(CHARGE_TYPE_FILTERS.map((f) => f.value).filter(Boolean))
  const selectedChargeType = validChargeTypes.has(rawChargeType) ? rawChargeType : ""
  const rawChargeStatus = readSearchParam(resolvedSearchParams?.chargeStatus).toLowerCase()
  const selectedChargeStatus = ["paid", "unpaid"].includes(rawChargeStatus) ? rawChargeStatus : ""
  const currentPeriod = new Date().toISOString().slice(0, 7) // YYYY-MM
  const currentBuildingId = await getCurrentBuildingId()
  if (currentBuildingId) await assertBuildingInOrg(currentBuildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = currentBuildingId ? [currentBuildingId] : accessibleBuildingIds
  const tenantBuildingWhere = {
    OR: [
      { space: { floor: { buildingId: { in: visibleBuildingIds } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
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
                where: { isPaid: false },
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

  const totalCharges = chargesAggregate._sum.amount ?? 0
  const paidCharges = paidChargesAggregate._sum.amount ?? 0
  const unpaidCharges = unpaidChargesAggregate._sum.amount ?? 0
  const totalExpenses = expensesAggregate._sum.amount ?? 0
  // Собираемость: оплачено / (оплачено + долг) — не зависит от фильтра по типу.
  const billedForRate = paidCharges + unpaidCharges
  const collectionRate = billedForRate > 0 ? Math.round((paidCharges / billedForRate) * 100) : 0
  const totalChargeCount = chargesAggregate._count._all
  const totalExpenseCount = expensesAggregate._count._all
  const dialogTenantOptions = dialogCharges
    .map((c) => c.tenant)
    .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
    .map((t) => ({ id: t.id, companyName: t.companyName }))
  if (selectedPaymentTenant && !dialogTenantOptions.some((tenant) => tenant.id === selectedPaymentTenant.id)) {
    dialogTenantOptions.push(selectedPaymentTenant)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Wallet}
        title="Финансы"
        subtitle={formatPeriod(currentPeriod)}
        actions={
          <>
          <Link
            href="/admin/finances/balance"
            className="flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-medium text-white"
          >
            <Wallet className="h-4 w-4" />
            Баланс счетов
          </Link>
          <Link
            href="/admin/finances/recurring"
            className="flex items-center gap-2 rounded-lg border border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10 hover:bg-orange-100 dark:hover:bg-orange-500/20 px-4 py-2 text-sm font-medium text-orange-700 dark:text-orange-300"
          >
            <Repeat className="h-4 w-4" />
            Постоянные расходы
          </Link>
          <Link
            href="/admin/finances/deposits"
            className="flex items-center gap-2 rounded-lg border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 px-4 py-2 text-sm font-medium text-purple-700 dark:text-purple-300"
          >
            <ShieldCheck className="h-4 w-4" />
            Депозиты
          </Link>
          <Link
            href="/admin/finances/import"
            className="flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300"
          >
            <Upload className="h-4 w-4" />
            Импорт банка
          </Link>
          <a
            href={`/api/export/documents-zip?period=${currentPeriod}`}
            download
            title="Все счета и АВР за текущий месяц одним архивом"
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            <FileSpreadsheet className="h-4 w-4" />
            ZIP за месяц
          </a>
          <a
            href="/api/export/1c"
            download
            className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300"
            title="Экспорт в формате 1C-Enterprise"
          >
            <FileSpreadsheet className="h-4 w-4" />
            1С
          </a>
          <a
            href="/api/export/finances"
            download
            className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </a>
          <GenerateChargesButton />
          <GenerateInvoicesButton />
          <BatchBillingButton defaultPeriod={currentPeriod} />
          <ExpenseDialog cashAccounts={cashAccounts} buildings={buildingOptions} currentBuildingId={currentBuildingId} />
          <PaymentDialog
            tenants={dialogTenantOptions}
            unpaidCharges={dialogCharges.map((c) => ({ id: c.id, tenantId: c.tenantId, type: CHARGE_TYPES[c.type] ?? c.type, amount: c.amount, description: c.description, period: c.period, isPaid: c.isPaid }))}
            cashAccounts={cashAccounts}
            initialTenantId={selectedPaymentTenant?.id}
            autoOpen={Boolean(selectedPaymentTenant)}
          />
          </>
        }
      />

      <PaymentReportsPanel reports={paymentReports} cashAccounts={cashAccounts} />

      {/* Summary cards */}
      <StatGrid>
        <StatCard icon={FileSpreadsheet} label="Начислено" value={formatMoney(totalCharges)} sub="за месяц" tone="blue" />
        <StatCard
          icon={CircleCheck}
          label="Оплачено"
          value={formatMoney(paidCharges)}
          sub={`собираемость ${collectionRate}%`}
          tone="emerald"
        />
        <StatCard
          icon={Wallet}
          label="Долг"
          value={formatMoney(unpaidCharges)}
          sub="не оплачено"
          tone={unpaidCharges > 0 ? "red" : "slate"}
        />
        <StatCard icon={TrendingDown} label="Расходы" value={formatMoney(totalExpenses)} sub="в этом месяце" tone="amber" />
      </StatGrid>

      <div className="grid grid-cols-2 gap-5">
        {/* Charges */}
        <Card padded={false}>
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Начисления за {formatPeriod(currentPeriod)}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Тип:</span>
              {CHARGE_TYPE_FILTERS.map((f) => {
                const active = (selectedChargeType || "") === f.value
                const params = new URLSearchParams()
                if (f.value) params.set("chargeType", f.value)
                if (selectedChargeStatus) params.set("chargeStatus", selectedChargeStatus)
                if (selectedTenantId) params.set("tenantId", selectedTenantId)
                if (expensesPage > 1) params.set("expensesPage", String(expensesPage))
                const qs = params.toString()
                const href = qs ? `/admin/finances?${qs}` : "/admin/finances"
                return (
                  <Link
                    key={f.value || "all-types"}
                    href={href}
                    className={`text-[11px] rounded-full px-2.5 py-0.5 border transition-colors ${
                      active
                        ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-300 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    {f.label}
                  </Link>
                )
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Статус:</span>
              {CHARGE_STATUS_FILTERS.map((f) => {
                const active = (selectedChargeStatus || "") === f.value
                const params = new URLSearchParams()
                if (selectedChargeType) params.set("chargeType", selectedChargeType)
                if (f.value) params.set("chargeStatus", f.value)
                if (selectedTenantId) params.set("tenantId", selectedTenantId)
                if (expensesPage > 1) params.set("expensesPage", String(expensesPage))
                const qs = params.toString()
                const href = qs ? `/admin/finances?${qs}` : "/admin/finances"
                return (
                  <Link
                    key={f.value || "all-status"}
                    href={href}
                    className={`text-[11px] rounded-full px-2.5 py-0.5 border transition-colors ${
                      active
                        ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-300 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    {f.label}
                  </Link>
                )
              })}
            </div>
          </div>
          {charges.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet className="h-5 w-5" />}
              title="Начислений за месяц нет"
              description="Сформируйте начисления за период после проверки арендаторов, ставок и сроков оплаты. Если арендаторов нет, начните с карточек аренды."
              actions={[
                { href: "/admin/tenants", label: "Проверить арендаторов" },
                { href: "/admin/data-quality", label: "Качество данных", variant: "secondary" },
              ]}
            />
          ) : (
            <ChargesBulkActions
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
        <Card padded={false} title="Последние оплаты">
          {payments.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-5 w-5" />}
              title="Оплат пока нет"
              description="Оплата появится после ручного внесения администратором или после подтверждения сообщения арендатора “Я оплатил”."
              actions={[
                { href: "/admin/finances/balance", label: "Проверить счета" },
                { href: "/admin/faq", label: "Инструкция арендатора", variant: "secondary" },
              ]}
            />
          ) : (
            <PaymentsBulkActions
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
        title="Расходы"
        actions={<ExpenseDialog cashAccounts={cashAccounts} buildings={buildingOptions} currentBuildingId={currentBuildingId} />}
      >
        <DataTable density="compact" className="min-w-[640px]">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 backdrop-blur supports-[backdrop-filter]:bg-slate-50/95 supports-[backdrop-filter]:dark:bg-slate-800/70">
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">Категория</th>
              {!currentBuildingId && <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">Здание</th>}
              <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">Описание</th>
              <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400">Дата</th>
              <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400">Сумма</th>
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
                <td className="text-slate-500 dark:text-slate-400">{e.date.toLocaleDateString("ru-RU")}</td>
                <td className="text-right font-medium text-orange-600 dark:text-orange-400">{formatMoney(e.amount)}</td>
                <td className="text-right">
                  <DeleteAction
                    action={deleteExpense.bind(null, e.id)}
                    entity="расход"
                    successMessage="Расход удалён"
                  />
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={currentBuildingId ? 5 : 6} className="px-5 py-6">
                  <EmptyState
                    icon={<Wallet className="h-5 w-5" />}
                    title="Расходы не добавлены"
                    description="Фиксируйте коммунальные платежи, ремонт, зарплаты и другие расходы по конкретному зданию, чтобы видеть прибыль по каждой точке."
                    actions={[
                      { href: "/admin/analytics", label: "Открыть аналитику" },
                      { href: "/admin/finances/balance", label: "Баланс счетов", variant: "secondary" },
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
