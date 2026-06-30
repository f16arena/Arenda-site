"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FilePlus2, Upload } from "lucide-react"
import { createExternalContract } from "@/app/actions/external-contract"
import { Button } from "@/components/ui/button"

// Внешний договор (PDF контрагента) — для арендаторов, не принимающих нашу
// редакцию (вышки Beeline/Altel, камеры Сергек). Загружаем готовый PDF.
export function ExternalContractButton({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  // Ступени графика аренды (необязательно). Сериализуются в hidden-поле rentSchedule.
  const [steps, setSteps] = useState<{ from: string; amount: string }[]>([])
  const addStep = () => setSteps((s) => [...s, { from: "", amount: "" }])
  const updateStep = (i: number, key: "from" | "amount", v: string) =>
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, [key]: v } : st)))
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i))
  const rentScheduleJson = JSON.stringify(
    steps
      .filter((s) => /^\d{4}-\d{2}$/.test(s.from) && s.amount !== "" && Number(s.amount) >= 0)
      .map((s) => ({ from: s.from, amount: Number(s.amount) })),
  )

  const inputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
  const labelCls = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <FilePlus2 className="h-3.5 w-3.5" /> Внешний договор (PDF)
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl bg-white dark:bg-slate-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 border-b border-slate-100 dark:border-slate-800 px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Внешний договор (PDF)</h3>
              <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                Договор контрагента, подписанный офлайн. Конструктор и ЭЦП не нужны — просто прикрепите PDF.
              </p>
            </div>
            <form
              action={(fd) =>
                startTransition(async () => {
                  try {
                    fd.set("tenantId", tenantId)
                    const f = fd.get("file")
                    if (f instanceof File && f.size > 10 * 1024 * 1024) {
                      toast.error("PDF больше 10 МБ — уменьшите файл и попробуйте снова")
                      return
                    }
                    await createExternalContract(fd)
                    toast.success("Внешний договор добавлен")
                    setOpen(false)
                    router.refresh()
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Ошибка")
                  }
                })
              }
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <div>
                <label className={labelCls}>Номер договора *</label>
                <input name="number" required placeholder="например, BEE-2026/14" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>PDF договора *</label>
                <input name="file" type="file" accept="application/pdf" required className={`${inputCls} file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs dark:file:bg-slate-800 dark:file:text-slate-200`} />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Только PDF, до 10 МБ.</p>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">Условия договора</p>
                <p className="-mt-2 mb-3 text-[11px] text-slate-400 dark:text-slate-500">
                  Записываются в карточку — по ним система начисляет аренду и считает дедлайны. Пустые поля не меняются.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>Аренда в месяц *</label>
                    <div className="flex gap-2">
                      <select name="rentMode" defaultValue="FIXED" className={`${inputCls} w-40 shrink-0`}>
                        <option value="FIXED">Фикс-сумма ₸</option>
                        <option value="RATE">Ставка ₸/м²</option>
                      </select>
                      <input name="rentAmount" type="number" min="0" step="any" inputMode="decimal" required placeholder="например, 450000" className={inputCls} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      «Ставка ₸/м²» — сумма считается как ставка × площадь помещений арендатора.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Начало *</label>
                      <input name="startDate" type="date" required className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Окончание *</label>
                      <input name="endDate" type="date" required className={inputCls} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>День оплаты</label>
                      <input name="paymentDueDay" type="number" min="1" max="31" placeholder="10" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Депозит, ₸</label>
                      <input name="depositAmount" type="number" min="0" step="any" inputMode="decimal" placeholder="напр., 450000" className={inputCls} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Индексация, %/год</label>
                      <input name="indexationPct" type="number" min="0" step="any" inputMode="decimal" placeholder="напр., 10" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Дата индексации</label>
                      <input name="nextIndexationAt" type="date" className={inputCls} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Пеня, %/день</label>
                      <input name="penaltyPercent" type="number" min="0" max="100" step="any" inputMode="decimal" placeholder="напр., 1" className={inputCls} />
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">За просрочку (0 = без пени).</p>
                    </div>
                    <div>
                      <label className={labelCls}>Каникулы, мес</label>
                      <input name="rentFreeMonths" type="number" min="0" max="24" step="1" inputMode="numeric" placeholder="напр., 3" className={inputCls} />
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Льготные месяцы (ремонт). Если задан график с 0 — не обязательно.</p>
                    </div>
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input name="serviceFeeExempt" type="checkbox" className="mt-0.5" />
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      Без эксплуатационного сбора (не добавлять «Эксплуатационные расходы» в начисления и счёт/АВР)
                    </span>
                  </label>

                  {/* Ступенчатая аренда: разные суммы по периодам (льготный, рост ставки) */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">График аренды (ступени)</p>
                      <button type="button" onClick={addStep} className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        + ступень
                      </button>
                    </div>
                    <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">
                      Если сумма меняется по периодам (льготный период, рост ставки) — задайте «с какого месяца → сколько ₸/мес».
                      Иначе оставьте пустым и используйте «Аренда в месяц» выше.
                    </p>
                    {steps.length > 0 && (
                      <div className="space-y-2">
                        {steps.map((st, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="month"
                              value={st.from}
                              onChange={(e) => updateStep(i, "from", e.target.value)}
                              className={`${inputCls} w-40 shrink-0`}
                            />
                            <input
                              type="number"
                              min="0"
                              step="any"
                              inputMode="decimal"
                              placeholder="₸/мес (0 = льгота)"
                              value={st.amount}
                              onChange={(e) => updateStep(i, "amount", e.target.value)}
                              className={inputCls}
                            />
                            <button
                              type="button"
                              onClick={() => removeStep(i)}
                              className="shrink-0 px-1.5 text-slate-400 hover:text-red-500"
                              title="Удалить ступень"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <input type="hidden" name="rentSchedule" value={rentScheduleJson} />
                  </div>

                  {/* Входящий долг на момент переноса в систему */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                    <p className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">Входящий долг</p>
                    <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">
                      Долг арендатора на момент переноса в Commrent. Создаст одно начисление-остаток; дальше система начисляет помесячно сама.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Сумма долга, ₸</label>
                        <input name="openingDebt" type="number" min="0" step="any" inputMode="decimal" placeholder="напр., 6000000" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Период долга</label>
                        <input name="openingDebtPeriod" type="month" className={inputCls} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className={labelCls}>Срок оплаты долга (необязательно)</label>
                      <input name="openingDebtDue" type="date" className={inputCls} />
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Пусто — пеня на долг автоматически не начисляется.</p>
                    </div>
                  </div>
                </div>
              </div>
              </div>
              <div className="flex shrink-0 gap-3 border-t border-slate-100 dark:border-slate-800 p-4">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">Отмена</Button>
                <Button type="submit" loading={pending} className="flex-1">
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> {pending ? "Загрузка..." : "Добавить"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
