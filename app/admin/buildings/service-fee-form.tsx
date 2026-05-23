"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Loader2, Save, Sparkles, Sun, Snowflake } from "lucide-react"
import { updateBuildingServiceFee } from "@/app/actions/service-fee"

const MONTH_LABELS = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
]

/**
 * Секция «Эксплуатационный сбор» на странице здания.
 * Зимний и летний тарифы (₸/м²/мес), переключатель месяцев зимы,
 * процент годовой индексации. Сохраняется в Building.serviceFee*.
 */
export function ServiceFeeForm({
  buildingId,
  initialWinterRate,
  initialSummerRate,
  initialWinterMonths,
  initialIndexationPct,
  lastIndexedAt,
}: {
  buildingId: string
  initialWinterRate: number | null
  initialSummerRate: number | null
  initialWinterMonths: number[]
  initialIndexationPct: number
  lastIndexedAt: Date | string | null
}) {
  const [winter, setWinter] = useState<string>(initialWinterRate?.toString() ?? "")
  const [summer, setSummer] = useState<string>(initialSummerRate?.toString() ?? "")
  const [months, setMonths] = useState<Set<number>>(new Set(initialWinterMonths))
  const [pct, setPct] = useState<string>(initialIndexationPct.toString())
  const [pending, startTransition] = useTransition()

  function toggleMonth(m: number) {
    setMonths((prev) => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })
  }

  function save() {
    startTransition(async () => {
      const r = await updateBuildingServiceFee({
        buildingId,
        winterRate: winter.trim() === "" ? null : Number(winter),
        summerRate: summer.trim() === "" ? null : Number(summer),
        winterMonths: Array.from(months),
        indexationPct: Number(pct) || 0,
      })
      if (r.ok) toast.success("Настройки эксплуатационного сбора сохранены")
      else toast.error(r.error ?? "Не удалось сохранить")
    })
  }

  // Предпросмотр: для помещения 100 м² посчитать примерный месячный платёж.
  const previewArea = 100
  const winterMonthly = winter && Number(winter) > 0 ? Number(winter) * previewArea : null
  const summerMonthly = summer && Number(summer) > 0 ? Number(summer) * previewArea : null

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Эксплуатационный сбор</h2>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
        Сезонные ставки за м²/мес. Зимой обычно выше (отопление), летом ниже. Сбор будет
        начисляться отдельной строкой к арендной плате каждое 1-е число месяца.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5">
            <Snowflake className="h-3.5 w-3.5 text-blue-500" />
            Зимний тариф, ₸/м²/мес
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={winter}
            onChange={(e) => setWinter(e.target.value)}
            placeholder="например 608"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
          {winterMonthly !== null && (
            <span className="text-[11px] text-slate-500">
              Для 100 м²: <b>{winterMonthly.toLocaleString("ru-RU")} ₸/мес</b>
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5">
            <Sun className="h-3.5 w-3.5 text-orange-500" />
            Летний тариф, ₸/м²/мес
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={summer}
            onChange={(e) => setSummer(e.target.value)}
            placeholder="например 270"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
          {summerMonthly !== null && (
            <span className="text-[11px] text-slate-500">
              Для 100 м²: <b>{summerMonthly.toLocaleString("ru-RU")} ₸/мес</b>
            </span>
          )}
        </label>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
          Зимние месяцы <span className="text-slate-500">(в остальных применяется летний тариф)</span>
        </p>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
          {MONTH_LABELS.map((label, idx) => {
            const m = idx + 1
            const on = months.has(m)
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggleMonth(m)}
                className={`rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                  on
                    ? "border-blue-500 bg-blue-500/15 text-blue-700 dark:text-blue-300"
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <label className="flex flex-col gap-1 max-w-xs">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Годовая индексация, %
        </span>
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
        />
        <span className="text-[11px] text-slate-500">
          Применяется автоматически раз в год.{" "}
          {lastIndexedAt
            ? `Последняя индексация: ${new Date(lastIndexedAt).toLocaleDateString("ru-RU")}`
            : "Первый раз сработает через год после первой ставки."}
        </span>
      </label>

      <div className="pt-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Сохранить
        </button>
      </div>
    </div>
  )
}
