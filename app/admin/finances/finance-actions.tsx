"use client"

import { useState, useTransition } from "react"
import { Plus, X, DollarSign, TrendingDown, AlertTriangle } from "lucide-react"
import { recordPayment, addExpense, generateMonthlyCharges, addCharge } from "@/app/actions/finance"
import { calculatePenalties } from "@/app/actions/penalties"

type Tenant = { id: string; companyName: string }
type Charge = { id: string; tenantId: string; type: string; amount: number; description: string | null; period: string; isPaid: boolean }
type CashAccount = { id: string; name: string; type: string }
type BuildingOption = { id: string; name: string }

export function PaymentDialog({ tenants, unpaidCharges, cashAccounts }: {
  tenants: Tenant[]
  unpaidCharges: Charge[]
  cashAccounts?: CashAccount[]
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [selectedTenant, setSelectedTenant] = useState("")
  const today = new Date().toISOString().slice(0, 10)

  const tenantCharges = unpaidCharges.filter((c) => c.tenantId === selectedTenant)

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
        <DollarSign className="h-4 w-4" />
        Внести оплату
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">Зафиксировать платёж</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form action={(fd) => startTransition(async () => { await recordPayment(fd); setOpen(false) })} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Арендатор *</label>
                <select name="tenantId" required value={selectedTenant} onChange={(e) => setSelectedTenant(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900 focus:border-emerald-500 focus:outline-none">
                  <option value="">Выберите арендатора</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.companyName}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Сумма, ₸ *</label>
                  <input name="amount" type="number" step="0.01" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Дата</label>
                  <input name="paymentDate" type="date" defaultValue={today} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Метод оплаты</label>
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
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Отметить долги как оплаченные</label>
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
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Примечание</label>
                <input name="note" placeholder="Необязательно" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Отмена</button>
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
}: {
  cashAccounts?: CashAccount[]
  buildings?: BuildingOption[]
  currentBuildingId?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const today = new Date().toISOString().slice(0, 10)
  const period = new Date().toISOString().slice(0, 7)
  const shouldChooseBuilding = !currentBuildingId && buildings.length > 1

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">
        <TrendingDown className="h-4 w-4" />
        Добавить расход
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">Новый расход</h2>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-400 dark:text-slate-500" /></button>
            </div>
            <form action={(fd) => startTransition(async () => { await addExpense(fd); setOpen(false) })} className="p-6 space-y-4">
              {currentBuildingId ? (
                <input type="hidden" name="buildingId" value={currentBuildingId} />
              ) : buildings.length === 1 ? (
                <input type="hidden" name="buildingId" value={buildings[0].id} />
              ) : shouldChooseBuilding ? (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Здание *</label>
                  <select name="buildingId" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
                    <option value="">Выберите здание</option>
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Категория</label>
                <select name="category" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
                  <option value="ELECTRICITY">Электроэнергия</option>
                  <option value="WATER">Водоснабжение</option>
                  <option value="HEATING">Отопление</option>
                  <option value="SALARY">Зарплата</option>
                  <option value="REPAIR">Ремонт</option>
                  <option value="CLEANING">Уборка</option>
                  <option value="SECURITY">Охрана</option>
                  <option value="OTHER">Прочее</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Сумма, ₸ *</label>
                  <input name="amount" type="number" step="0.01" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Период</label>
                  <input name="period" defaultValue={period} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Дата</label>
                <input name="date" type="date" defaultValue={today} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-1.5">Описание</label>
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
                <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 py-2 text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500">Отмена</button>
                <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm text-white disabled:opacity-60">
                  {pending ? "Сохранение..." : "Добавить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function PenaltyButton() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-xs text-amber-600 dark:text-amber-400">{result}</span>}
      <button
        onClick={() => startTransition(async () => {
          const r = await calculatePenalties()
          setResult(`✓ Пеней начислено: ${r.penaltiesCreated}`)
          setTimeout(() => setResult(null), 5000)
        })}
        disabled={pending}
        className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20 dark:bg-amber-500/20 disabled:opacity-60"
      >
        <AlertTriangle className="h-4 w-4" />
        {pending ? "Расчёт..." : "Рассчитать пени"}
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
        onClick={() => startTransition(async () => {
          const r = await generateMonthlyCharges(period)
          setResult(r.created > 0 ? `✓ Создано ${r.created} начислений за ${period}` : "Начисления за этот месяц уже существуют")
          setTimeout(() => setResult(null), 4000)
        })}
        disabled={pending}
        className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 disabled:opacity-60"
      >
        <Plus className="h-4 w-4" />
        {pending ? "Генерация..." : `Начислить за ${period}`}
      </button>
    </div>
  )
}
