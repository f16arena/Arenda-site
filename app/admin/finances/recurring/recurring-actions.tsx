"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X, Repeat, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  addRecurringExpense,
  toggleRecurringExpense,
  generateRecurringExpensesNow,
} from "@/app/actions/recurring-expenses"
import { EXPENSE_CATEGORIES } from "@/lib/utils"

type CashAccount = { id: string; name: string; type: string }
type BuildingOption = { id: string; name: string }

const CATEGORY_OPTIONS = Object.entries(EXPENSE_CATEGORIES)

export function RecurringExpenseDialog({
  cashAccounts,
  buildings = [],
  currentBuildingId,
}: {
  cashAccounts?: CashAccount[]
  buildings?: BuildingOption[]
  currentBuildingId?: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const shouldChooseBuilding = !currentBuildingId && buildings.length > 1

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-medium text-white"
      >
        <Plus className="h-4 w-4" />
        Постоянный расход
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">Постоянный расход</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть" title="Закрыть">
                <X className="h-5 w-5 text-slate-400 dark:text-slate-500" />
              </button>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  setError(null)
                  const r = await addRecurringExpense(fd)
                  if (r?.error) {
                    setError(r.error)
                    return
                  }
                  setOpen(false)
                  router.refresh()
                })
              }
              className="p-6 space-y-4"
            >
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
                <select name="category" defaultValue="SALARY" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
                  {CATEGORY_OPTIONS.map(([value, label]) => (
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
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Число месяца</label>
                  <input name="dayOfMonth" type="number" min={1} max={28} defaultValue={1} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Период повтора</label>
                <select name="schedule" defaultValue="always" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
                  <option value="always">Каждый месяц</option>
                  <option value="winter">Только зимой (окт–апр)</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">«Только зимой» — для отопления: расход создаётся лишь в октябре–апреле.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Описание</label>
                <input name="description" placeholder="Необязательно" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm" />
              </div>

              {cashAccounts && cashAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Со счёта <span className="text-slate-400 dark:text-slate-500">(автосписание при генерации)</span>
                  </label>
                  <select name="cashAccountId" defaultValue="" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
                    <option value="">Не списывать (просто фиксировать расход)</option>
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.type === "BANK" ? "Банк" : a.type === "CASH" ? "Касса" : "Карта"})</option>
                    ))}
                  </select>
                </div>
              )}

              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

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

export function RecurringToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await toggleRecurringExpense(id, !isActive)
          router.refresh()
        })
      }
      className={`text-[11px] rounded-full px-2.5 py-0.5 border transition-colors disabled:opacity-60 ${
        isActive
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-400"
      }`}
      title={isActive ? "Активен — нажмите, чтобы приостановить" : "Приостановлен — нажмите, чтобы включить"}
    >
      {isActive ? "Активен" : "Пауза"}
    </button>
  )
}

export function GenerateRecurringButton({ period }: { period: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-xs text-emerald-600 dark:text-emerald-400">{result}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await generateRecurringExpensesNow(period)
            setResult(r.created > 0 ? `✓ Создано ${r.created} расходов за ${period}` : "Расходы за этот месяц уже созданы")
            router.refresh()
            setTimeout(() => setResult(null), 4000)
          })
        }
        className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 disabled:opacity-60"
      >
        <Repeat className="h-4 w-4" />
        {pending ? "Генерация..." : `Сгенерировать за ${period}`}
      </button>
    </div>
  )
}
