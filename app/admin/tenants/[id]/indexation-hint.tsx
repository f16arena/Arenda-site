"use client"

import { useState } from "react"
import { TrendingUp, X } from "lucide-react"

type Props = {
  initialContractEnd: string | null  // ISO yyyy-mm-dd или null
  initialRate: number | null         // ₸/м² (customRate или ratePerSqm этажа)
  monthlyRent: number                 // текущая месячная сумма
}

/**
 * Client-компонент: следит за изменением даты окончания договора.
 * Если новая дата позже текущей минимум на 30 дней — показывает напоминание
 * об индексации ставки (по типовому договору не более 10% годовых).
 */
export function IndexationHint({ initialContractEnd, initialRate, monthlyRent }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [extension, setExtension] = useState<{
    days: number
    years: number
    rate5: number
    rate10: number
    rent5: number
    rent10: number
  } | null>(null)

  // Слушаем изменение поля contractEnd (по name)
  const onMount = (el: HTMLInputElement | null) => {
    if (!el) return
    const dateInput = document.querySelector<HTMLInputElement>('input[name="contractEnd"]')
    if (!dateInput) return
    const handler = () => {
      const newDateStr = dateInput.value
      if (!newDateStr || !initialContractEnd) {
        setExtension(null)
        return
      }
      const oldDate = new Date(initialContractEnd)
      const newDate = new Date(newDateStr)
      const diffDays = Math.floor((newDate.getTime() - oldDate.getTime()) / 86_400_000)
      if (diffDays < 30) {
        setExtension(null)
        return
      }
      const years = diffDays / 365
      const rate = initialRate ?? 0
      const rate5 = Math.round(rate * 1.05 * 100) / 100
      const rate10 = Math.round(rate * 1.1 * 100) / 100
      const rent5 = Math.round(monthlyRent * 1.05)
      const rent10 = Math.round(monthlyRent * 1.1)
      setExtension({ days: diffDays, years, rate5, rate10, rent5, rent10 })
    }
    dateInput.addEventListener("change", handler)
    dateInput.addEventListener("input", handler)
    handler()
  }

  if (dismissed || !extension) return <span ref={onMount as never} className="hidden" />

  const fmt = (n: number) => n.toLocaleString("ru-RU")

  return (
    <div className="col-span-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-3">
      <div className="flex items-start gap-2.5">
        <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 text-xs">
          <p className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
            Договор продлевается на {extension.days} дн.{extension.years >= 1 ? ` (≈${extension.years.toFixed(1)} года)` : ""} — рекомендуется индексация ставки
          </p>
          <p className="text-amber-800 dark:text-amber-200 mb-1.5">
            По типовому договору индексация не более <b>10% годовых</b> (по уровню инфляции НБ РК).
          </p>
          {initialRate && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-amber-900 dark:text-amber-200">
              <div className="bg-white dark:bg-slate-900 rounded px-2 py-1.5 border border-amber-200 dark:border-amber-500/30">
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Текущая</p>
                <p className="font-mono">{fmt(initialRate)} ₸/м²</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">{fmt(monthlyRent)} ₸/мес</p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded px-2 py-1.5 border border-amber-200 dark:border-amber-500/30">
                <p className="text-[10px] text-slate-500 dark:text-slate-400">+5% (умеренно)</p>
                <p className="font-mono text-amber-700 dark:text-amber-300">{fmt(extension.rate5)} ₸/м²</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400">{fmt(extension.rent5)} ₸/мес</p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded px-2 py-1.5 border border-amber-300 dark:border-amber-500/40">
                <p className="text-[10px] text-slate-500 dark:text-slate-400">+10% (макс)</p>
                <p className="font-mono text-amber-700 dark:text-amber-300">{fmt(extension.rate10)} ₸/м²</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400">{fmt(extension.rent10)} ₸/мес</p>
              </div>
            </div>
          )}
          <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1.5">
            Чтобы применить новую ставку — после сохранения дат измените «Индивид. ставку ₸/м²» в разделе ниже.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-600 dark:text-amber-400 hover:text-amber-800 shrink-0"
          title="Закрыть подсказку"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
