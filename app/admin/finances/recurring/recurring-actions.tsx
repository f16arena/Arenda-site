"use client"
import { ModalShell } from "@/components/ui/modal"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X, Repeat, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  addRecurringExpense,
  toggleRecurringExpense,
  generateRecurringExpensesNow,
} from "@/app/actions/recurring-expenses"
import { useT } from "@/lib/i18n/client"

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
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const shouldChooseBuilding = !currentBuildingId && buildings.length > 1
  // Подпись из словаря по коду из базы; нет строки — показываем сам код.
  const dictLabel = (key: string, fallback: string) => {
    const text = t(key as Parameters<typeof t>[0])
    return text === key ? fallback : text
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {t("adminFinance.recurring.dialog.trigger")}
      </Button>

      <ModalShell open={open} onClose={() => setOpen(false)} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold">{t("adminFinance.recurring.dialog.title")}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("common.actions.close")} title={t("common.actions.close")}>
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
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.recurring.dialog.building")}</label>
                  <select name="buildingId" required className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
                    <option value="">{t("adminFinance.recurring.dialog.buildingPlaceholder")}</option>
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.recurring.dialog.category")}</label>
                <select name="category" defaultValue="SALARY" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
                  {EXPENSE_CATEGORY_CODES.map((code) => (
                    <option key={code} value={code}>{dictLabel(`adminFinance.expenseCategories.${code}`, code)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.recurring.dialog.amount")}</label>
                  <Input name="amount" type="number" step="0.01" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.recurring.dialog.dayOfMonth")}</label>
                  <Input name="dayOfMonth" type="number" min={1} max={28} defaultValue={1} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.recurring.dialog.schedule")}</label>
                <select name="schedule" defaultValue="always" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
                  <option value="always">{t("adminFinance.recurring.everyMonth")}</option>
                  <option value="winter">{t("adminFinance.recurring.winterOnly")}</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{t("adminFinance.recurring.dialog.scheduleHint")}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.recurring.dialog.description")}</label>
                <Input name="description" placeholder={t("adminFinance.recurring.dialog.descriptionPlaceholder")} />
              </div>

              {cashAccounts && cashAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    {t("adminFinance.recurring.dialog.account")}{" "}
                    <span className="text-slate-400 dark:text-slate-500">{t("adminFinance.recurring.dialog.accountHint")}</span>
                  </label>
                  <select name="cashAccountId" defaultValue="" className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900">
                    <option value="">{t("adminFinance.recurring.dialog.accountNone")}</option>
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({dictLabel(`adminFinance.accountTypes.${a.type}`, a.type)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

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

export function RecurringToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter()
  const { t } = useT()
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
      title={isActive ? t("adminFinance.recurring.activeHint") : t("adminFinance.recurring.pausedHint")}
    >
      {isActive ? t("adminFinance.recurring.active") : t("adminFinance.recurring.paused")}
    </button>
  )
}

export function GenerateRecurringButton({ period, periodLabel }: { period: string; periodLabel: string }) {
  const router = useRouter()
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-xs text-emerald-600 dark:text-emerald-400">{result}</span>}
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await generateRecurringExpensesNow(period)
            setResult(
              r.created > 0
                ? t("adminFinance.recurring.generate.done", { count: r.created, period: periodLabel })
                : t("adminFinance.recurring.generate.nothing"),
            )
            router.refresh()
            setTimeout(() => setResult(null), 4000)
          })
        }
      >
        <Repeat className="h-4 w-4" />
        {pending ? t("adminFinance.recurring.generate.pending") : t("adminFinance.recurring.generate.trigger", { period: periodLabel })}
      </Button>
    </div>
  )
}
