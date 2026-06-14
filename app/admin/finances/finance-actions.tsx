"use client"

import { useState, useTransition } from "react"
import { Plus, X, DollarSign, TrendingDown, FileText } from "lucide-react"
import { recordPayment, addExpense, generateMonthlyCharges, generateMonthlyInvoicesNow } from "@/app/actions/finance"
// calculatePenalties удалена — пени теперь только cron-ом.
import { Button } from "@/components/ui/button"
import { EXPENSE_CATEGORIES, formatMoney, formatPeriod } from "@/lib/utils"
import { Droplet, Zap, Flame, CheckCircle2 } from "lucide-react"

type Tenant = { id: string; companyName: string }
type Charge = { id: string; tenantId: string; type: string; amount: number; description: string | null; period: string; isPaid: boolean }
type CashAccount = { id: string; name: string; type: string }
type BuildingOption = { id: string; name: string }

export function PaymentDialog({ tenants, unpaidCharges, cashAccounts, initialTenantId, autoOpen }: {
  tenants: Tenant[]
  unpaidCharges: Charge[]
  cashAccounts?: CashAccount[]
  initialTenantId?: string
  autoOpen?: boolean
}) {
  const [open, setOpen] = useState(Boolean(autoOpen))
  const [pending, startTransition] = useTransition()
  const [selectedTenant, setSelectedTenant] = useState(initialTenantId ?? "")
  const today = new Date().toISOString().slice(0, 10)

  const tenantCharges = unpaidCharges.filter((c) => c.tenantId === selectedTenant)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
        <DollarSign className="h-4 w-4" />
        Внести оплату
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">Зафиксировать платёж</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть окно оплаты" title="Закрыть"><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form action={(fd) => startTransition(async () => { await recordPayment(fd); setOpen(false) })} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Арендатор *</label>
                <select name="tenantId" required value={selectedTenant} onChange={(e) => setSelectedTenant(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:border-emerald-500 focus:outline-none">
                  <option value="">Выберите арендатора</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.companyName}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Сумма, ₸ *</label>
                  <input name="amount" type="number" step="0.01" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Дата</label>
                  <input name="paymentDate" type="date" defaultValue={today} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Метод оплаты</label>
                <select name="method" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:outline-none">
                  <option value="TRANSFER">Банковский перевод</option>
                  <option value="CASH">Наличные</option>
                  <option value="KASPI">Kaspi</option>
                  <option value="CARD">Карта</option>
                </select>
              </div>
              {cashAccounts && cashAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    На счёт <span className="text-slate-400 dark:text-slate-500">(автоматически зачислится)</span>
                  </label>
                  <select
                    name="cashAccountId"
                    defaultValue=""
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:outline-none"
                  >
                    <option value="">Не зачислять (просто фиксировать платёж)</option>
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.type === "BANK" ? "Банк" : a.type === "CASH" ? "Касса" : "Карта"})</option>
                    ))}
                  </select>
                </div>
              )}
              {tenantCharges.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Отметить долги как оплаченные</label>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {tenantCharges.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" name="chargeIds" value={c.id} className="rounded" />
                        <span>{c.type} · {c.period} · {c.amount.toLocaleString()} ₸</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Примечание</label>
                <input name="note" placeholder="Необязательно" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400">Отмена</button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60">
                  {pending ? "Сохранение..." : "Зафиксировать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function ExpenseDialog({
  cashAccounts,
  buildings = [],
  currentBuildingId,
  defaultCategory = "ELECTRICITY",
  triggerLabel = "Добавить расход",
  triggerClassName,
}: {
  cashAccounts?: CashAccount[]
  buildings?: BuildingOption[]
  currentBuildingId?: string | null
  defaultCategory?: string
  triggerLabel?: string
  triggerClassName?: string
}) {
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
        {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">Новый расход</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть окно расхода" title="Закрыть"><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form action={(fd) => startTransition(async () => { await addExpense(fd); setOpen(false) })} className="p-6 space-y-4">
              {currentBuildingId ? (
                <input type="hidden" name="buildingId" value={currentBuildingId} />
              ) : buildings.length === 1 ? (
                <input type="hidden" name="buildingId" value={buildings[0].id} />
              ) : shouldChooseBuilding ? (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Здание *</label>
                  <select name="buildingId" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
                    <option value="">Выберите здание</option>
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Категория</label>
                <select name="category" defaultValue={defaultCategory} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
                  {Object.entries(EXPENSE_CATEGORIES).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Сумма, ₸ *</label>
                  <input name="amount" type="number" step="0.01" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Период</label>
                  <input name="period" defaultValue={period} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Дата</label>
                <input name="date" type="date" defaultValue={today} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Описание</label>
                <input name="description" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm" />
              </div>
              {cashAccounts && cashAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Со счёта <span className="text-slate-400 dark:text-slate-500">(автоматически спишется)</span>
                  </label>
                  <select
                    name="cashAccountId"
                    defaultValue=""
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900"
                  >
                    <option value="">Не списывать (просто фиксировать расход)</option>
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.type === "BANK" ? "Банк" : a.type === "CASH" ? "Касса" : "Карта"})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">Отмена</Button>
                <Button type="submit" loading={pending} className="flex-1">
                  {pending ? "Сохранение..." : "Добавить"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

// Напоминание о переменных расходах (вода/свет/отопление-зимой), которые нужно
// вносить вручную каждый месяц (сумма меняется). Показывает, что уже внесено за
// период, что — нет, и сумму прошлого месяца как ориентир. Постоянные расходы
// (зарплата и т.п.) сюда не входят — они создаются автоматически из шаблонов.
type VariableExpenseItem = {
  category: string
  label: string
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
          Переменные расходы за {formatPeriod(period)}
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {allEntered ? "всё внесено" : `не внесено: ${missing.length}`}
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
              <span className="font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
              {item.entered ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">внесён ✓</span>
              ) : (
                <ExpenseDialog
                  cashAccounts={cashAccounts}
                  buildings={buildings}
                  currentBuildingId={currentBuildingId}
                  defaultCategory={item.category}
                  triggerLabel={`Внести${item.lastAmount != null ? ` (≈${formatMoney(item.lastAmount)})` : ""}`}
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

export function GenerateInvoicesButton() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)
  const period = new Date().toISOString().slice(0, 7)

  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-xs text-emerald-600 dark:text-emerald-400">{result}</span>}
      <button
        type="button"
        onClick={() => startTransition(async () => {
          const r = await generateMonthlyInvoicesNow(period)
          setResult(r.created > 0 ? `✓ Выставлено ${r.created} счетов за ${period}` : "Счета за этот месяц уже выставлены (или нет начислений)")
          setTimeout(() => setResult(null), 5000)
        })}
        disabled={pending}
        className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 disabled:opacity-60"
        title="Сформировать счета на оплату из начислений и отправить арендаторам в кабинет"
      >
        <FileText className="h-4 w-4" />
        {pending ? "Генерация..." : `Выставить счета за ${period}`}
      </button>
    </div>
  )
}

export function GenerateChargesButton() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)
  const period = new Date().toISOString().slice(0, 7)

  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-xs text-emerald-600 dark:text-emerald-400">{result}</span>}
      <button
        type="button"
        onClick={() => startTransition(async () => {
          const r = await generateMonthlyCharges(period)
          setResult(r.created > 0 ? `✓ Создано ${r.created} начислений за ${period}` : "Начисления за этот месяц уже существуют")
          setTimeout(() => setResult(null), 4000)
        })}
        disabled={pending}
        className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 disabled:opacity-60"
      >
        <Plus className="h-4 w-4" />
        {pending ? "Генерация..." : `Начислить за ${period}`}
      </button>
    </div>
  )
}
