"use client"
import { ModalShell } from "@/components/ui/modal"

import { useState, useTransition } from "react"
import { Plus, X, DollarSign, TrendingDown, FileText } from "lucide-react"
import { recordPayment, addExpense, generateMonthlyCharges, generateMonthlyInvoicesNow, listChargeableTenants } from "@/app/actions/finance"
// calculatePenalties удалена — пени теперь только cron-ом.
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLocale, useT } from "@/lib/i18n/client"
import { formatMoneyL, formatPeriodL } from "@/lib/i18n/format"
import { Droplet, Zap, Flame, CheckCircle2 } from "lucide-react"

type Tenant = { id: string; companyName: string }
type Charge = { id: string; tenantId: string; type: string; amount: number; description: string | null; period: string; isPaid: boolean }
type CashAccount = { id: string; name: string; type: string }
type BuildingOption = { id: string; name: string }

// Категории расходов (Expense.category): порядок фиксирован, подписи — из словаря.
const EXPENSE_CATEGORY_CODES = [
  "SALARY",
  "GARBAGE",
  "CLEANING",
  "INTERNET",
  "SECURITY",
  "ELECTRICITY",
  "WATER",
  "HEATING",
  "GAS",
  "REPAIR",
  "OTHER",
] as const

/** Подпись вида «Каспи Бизнес (Банк)» для выпадашки счетов. */
function useAccountLabel() {
  const { t } = useT()
  return (account: CashAccount) => {
    const key = `adminFinance.accountTypes.${account.type}` as Parameters<typeof t>[0]
    const type = t(key)
    return `${account.name} (${type === key ? account.type : type})`
  }
}

function useExpenseCategoryLabel() {
  const { t } = useT()
  return (category: string) => {
    const key = `adminFinance.expenseCategories.${category}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? category : label
  }
}

export function PaymentDialog({ tenants, unpaidCharges, cashAccounts, initialTenantId, autoOpen }: {
  tenants: Tenant[]
  unpaidCharges: Charge[]
  cashAccounts?: CashAccount[]
  initialTenantId?: string
  autoOpen?: boolean
}) {
  const { t } = useT()
  const locale = useLocale()
  const accountLabel = useAccountLabel()
  const [open, setOpen] = useState(Boolean(autoOpen))
  const [pending, startTransition] = useTransition()
  const [selectedTenant, setSelectedTenant] = useState(initialTenantId ?? "")
  const today = new Date().toISOString().slice(0, 10)

  const tenantCharges = unpaidCharges.filter((c) => c.tenantId === selectedTenant)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
        <DollarSign className="h-4 w-4" />
        {t("adminFinance.paymentDialog.trigger")}
      </button>

      <ModalShell open={open} onClose={() => setOpen(false)} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">{t("adminFinance.paymentDialog.title")}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("adminFinance.paymentDialog.close")} title={t("common.actions.close")}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form action={(fd) => startTransition(async () => { await recordPayment(fd); setOpen(false) })} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.paymentDialog.tenant")}</label>
                <select name="tenantId" required value={selectedTenant} onChange={(e) => setSelectedTenant(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:border-emerald-500 focus:outline-none">
                  <option value="">{t("adminFinance.paymentDialog.tenantPlaceholder")}</option>
                  {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.companyName}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.paymentDialog.amount")}</label>
                  <Input name="amount" type="number" step="0.01" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.paymentDialog.date")}</label>
                  <Input name="paymentDate" type="date" defaultValue={today} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.paymentDialog.method")}</label>
                <select name="method" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:outline-none">
                  <option value="TRANSFER">{t("domain.paymentMethods.TRANSFER")}</option>
                  <option value="CASH">{t("domain.paymentMethods.CASH")}</option>
                  <option value="KASPI">{t("domain.paymentMethods.KASPI")}</option>
                  <option value="CARD">{t("domain.paymentMethods.CARD")}</option>
                </select>
              </div>
              {cashAccounts && cashAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    {t("adminFinance.paymentDialog.account")} <span className="text-slate-400 dark:text-slate-500">{t("adminFinance.paymentDialog.accountHint")}</span>
                  </label>
                  <select
                    name="cashAccountId"
                    defaultValue=""
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:outline-none"
                  >
                    <option value="">{t("adminFinance.paymentDialog.accountNone")}</option>
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{accountLabel(a)}</option>
                    ))}
                  </select>
                </div>
              )}
              {tenantCharges.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.paymentDialog.closeCharges")}</label>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {tenantCharges.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" name="chargeIds" value={c.id} className="rounded" />
                        <span>{c.type} · {c.period} · {formatMoneyL(locale, c.amount)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.paymentDialog.note")}</label>
                <Input name="note" placeholder={t("adminFinance.paymentDialog.notePlaceholder")} />
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">{t("common.actions.cancel")}</Button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60">
                  {pending ? t("common.actions.saving") : t("adminFinance.paymentDialog.submit")}
                </button>
              </div>
            </form>
          </ModalShell>
    </>
  )
}

export function ExpenseDialog({
  cashAccounts,
  buildings = [],
  currentBuildingId,
  defaultCategory = "ELECTRICITY",
  triggerLabel,
  triggerClassName,
}: {
  cashAccounts?: CashAccount[]
  buildings?: BuildingOption[]
  currentBuildingId?: string | null
  defaultCategory?: string
  triggerLabel?: string
  triggerClassName?: string
}) {
  const { t } = useT()
  const accountLabel = useAccountLabel()
  const categoryLabel = useExpenseCategoryLabel()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const today = new Date().toISOString().slice(0, 10)
  const period = new Date().toISOString().slice(0, 7)
  const shouldChooseBuilding = !currentBuildingId && buildings.length > 1

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? "flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"}
      >
        <TrendingDown className="h-4 w-4" />
        {triggerLabel ?? t("adminFinance.expenseDialog.trigger")}
      </button>

      <ModalShell open={open} onClose={() => setOpen(false)} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">{t("adminFinance.expenseDialog.title")}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("adminFinance.expenseDialog.close")} title={t("common.actions.close")}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form action={(fd) => startTransition(async () => { await addExpense(fd); setOpen(false) })} className="p-6 space-y-4">
              {currentBuildingId ? (
                <input type="hidden" name="buildingId" value={currentBuildingId} />
              ) : buildings.length === 1 ? (
                <input type="hidden" name="buildingId" value={buildings[0].id} />
              ) : shouldChooseBuilding ? (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.expenseDialog.building")}</label>
                  <select name="buildingId" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
                    <option value="">{t("adminFinance.expenseDialog.buildingPlaceholder")}</option>
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.expenseDialog.category")}</label>
                <select name="category" defaultValue={defaultCategory} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
                  {EXPENSE_CATEGORY_CODES.map((value) => (
                    <option key={value} value={value}>{categoryLabel(value)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.expenseDialog.amount")}</label>
                  <Input name="amount" type="number" step="0.01" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.expenseDialog.period")}</label>
                  <Input name="period" defaultValue={period} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.expenseDialog.date")}</label>
                <Input name="date" type="date" defaultValue={today} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.expenseDialog.description")}</label>
                <Input name="description" />
              </div>
              {cashAccounts && cashAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    {t("adminFinance.expenseDialog.account")} <span className="text-slate-400 dark:text-slate-500">{t("adminFinance.expenseDialog.accountHint")}</span>
                  </label>
                  <select
                    name="cashAccountId"
                    defaultValue=""
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900"
                  >
                    <option value="">{t("adminFinance.expenseDialog.accountNone")}</option>
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{accountLabel(a)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">{t("common.actions.cancel")}</Button>
                <Button type="submit" loading={pending} className="flex-1">
                  {pending ? t("common.actions.saving") : t("common.actions.add")}
                </Button>
              </div>
            </form>
          </ModalShell>
    </>
  )
}

// Напоминание о переменных расходах (вода/свет/отопление-зимой), которые нужно
// вносить вручную каждый месяц (сумма меняется). Показывает, что уже внесено за
// период, что — нет, и сумму прошлого месяца как ориентир. Постоянные расходы
// (зарплата и т.п.) сюда не входят — они создаются автоматически из шаблонов.
type VariableExpenseItem = {
  category: string
  entered: boolean
  lastAmount: number | null
}

const VARIABLE_ICONS: Record<string, typeof Droplet> = {
  WATER: Droplet,
  ELECTRICITY: Zap,
  HEATING: Flame,
}

export function VariableExpenseReminder({
  items,
  cashAccounts,
  buildings = [],
  currentBuildingId,
  period,
}: {
  items: VariableExpenseItem[]
  cashAccounts?: CashAccount[]
  buildings?: BuildingOption[]
  currentBuildingId?: string | null
  period: string
}) {
  const { t } = useT()
  const locale = useLocale()
  const categoryLabel = useExpenseCategoryLabel()
  if (items.length === 0) return null
  const missing = items.filter((i) => !i.entered)
  const allEntered = missing.length === 0

  return (
    <div
      className={`rounded-xl border p-4 ${
        allEntered
          ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/5"
          : "border-amber-200 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/5"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        {allEntered ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Droplet className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        )}
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t("adminFinance.variable.title", { period: formatPeriodL(locale, period) })}
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {allEntered ? t("adminFinance.variable.allEntered") : t("adminFinance.variable.missing", { count: missing.length })}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const Icon = VARIABLE_ICONS[item.category] ?? Droplet
          return (
            <div
              key={item.category}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                item.entered
                  ? "border-emerald-200 bg-white dark:border-emerald-500/20 dark:bg-slate-900"
                  : "border-amber-200 bg-white dark:border-amber-500/20 dark:bg-slate-900"
              }`}
            >
              <Icon className={`h-4 w-4 ${item.entered ? "text-emerald-500" : "text-amber-500"}`} />
              <span className="font-medium text-slate-700 dark:text-slate-300">{categoryLabel(item.category)}</span>
              {item.entered ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">{t("adminFinance.variable.entered")}</span>
              ) : (
                <ExpenseDialog
                  cashAccounts={cashAccounts}
                  buildings={buildings}
                  currentBuildingId={currentBuildingId}
                  defaultCategory={item.category}
                  triggerLabel={
                    item.lastAmount != null
                      ? t("adminFinance.variable.addWithHint", { amount: formatMoneyL(locale, item.lastAmount) })
                      : t("adminFinance.variable.add")
                  }
                  triggerClassName="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// PenaltyButton удалён (см. app/actions/penalties.ts). Пени теперь автоматические.

export function GenerateInvoicesButton({ period: periodProp }: { period?: string } = {}) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)
  const period = periodProp && /^\d{4}-\d{2}$/.test(periodProp) ? periodProp : new Date().toISOString().slice(0, 7)

  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-xs text-emerald-600 dark:text-emerald-400">{result}</span>}
      <Button
        type="button"
        variant="outline"
        onClick={() => startTransition(async () => {
          const r = await generateMonthlyInvoicesNow(period)
          setResult(r.created > 0
            ? t("adminFinance.generate.invoicesDone", { count: r.created, period })
            : t("adminFinance.generate.invoicesNothing"))
          setTimeout(() => setResult(null), 5000)
        })}
        disabled={pending}
        title={t("adminFinance.generate.invoicesTitle")}
      >
        <FileText className="h-4 w-4" />
        {pending ? t("adminFinance.generate.invoicesPending") : t("adminFinance.generate.invoicesTrigger", { period })}
      </Button>
    </div>
  )
}

type ChargeableRow = { id: string; name: string; placement: string; amount: number; shouldCreate: boolean; alreadyCharged: boolean }

/** Выборочное начисление аренды: диалог со списком арендаторов (галочки). */
export function GenerateChargesButton({ period: periodProp }: { period?: string } = {}) {
  const { t } = useT()
  const locale = useLocale()
  const period = periodProp && /^\d{4}-\d{2}$/.test(periodProp) ? periodProp : new Date().toISOString().slice(0, 7)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ChargeableRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  const selectable = rows.filter((r) => r.shouldCreate && !r.alreadyCharged)

  async function loadRows() {
    setLoading(true)
    try {
      const list = await listChargeableTenants(period)
      setRows(list)
      setSelected(new Set(list.filter((r) => r.shouldCreate && !r.alreadyCharged).map((r) => r.id)))
    } finally {
      setLoading(false)
    }
  }

  function openDialog() {
    setOpen(true)
    setResult(null)
    void loadRows()
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function submit() {
    startTransition(async () => {
      const r = await generateMonthlyCharges(period, [...selected])
      setResult(r.created > 0
        ? t("adminFinance.generate.done", { count: r.created })
        : t("adminFinance.generate.nothing"))
      await loadRows()
      setTimeout(() => { setOpen(false); setResult(null) }, 1400)
    })
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={openDialog}>
        <Plus className="h-4 w-4" />
        {t("adminFinance.generate.chargesTrigger", { period: formatPeriodL(locale, period) })}
      </Button>

      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        title={t("adminFinance.generate.chargesTitle")}
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("adminFinance.generate.chargesHeading", { period: formatPeriodL(locale, period) })}
          </h3>
          <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-[120px] flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400">{t("common.state.loading")}</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">{t("adminFinance.generate.chargesEmpty")}</div>
          ) : (
            rows.map((r) => {
              const disabled = !r.shouldCreate || r.alreadyCharged
              return (
                <label
                  key={r.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 ${disabled ? "opacity-60" : "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    disabled={disabled}
                    onChange={() => toggle(r.id)}
                    className="h-4 w-4 accent-blue-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate-800 dark:text-slate-100">{r.name}</div>
                    {r.placement && <div className="truncate text-[11px] text-slate-400 dark:text-slate-500">{r.placement}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{formatMoneyL(locale, r.amount)}</div>
                    {r.alreadyCharged && <div className="text-[11px] text-emerald-600 dark:text-emerald-400">{t("adminFinance.generate.alreadyCharged")}</div>}
                  </div>
                </label>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          {result ? (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">{result}</span>
          ) : (
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>{t("adminFinance.generate.selected", { count: selected.size })}</span>
              <button type="button" onClick={() => setSelected(new Set(selectable.map((r) => r.id)))} className="text-blue-600 hover:underline dark:text-blue-400">
                {t("adminFinance.generate.selectAll", { count: selectable.length })}
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="text-slate-400 hover:underline">{t("adminFinance.generate.clear")}</button>
            </div>
          )}
          <Button type="button" variant="primary" size="sm" onClick={submit} disabled={pending || selected.size === 0}>
            {pending ? t("adminFinance.generate.submitting") : t("adminFinance.generate.submit", { count: selected.size })}
          </Button>
        </div>
      </ModalShell>
    </>
  )
}
