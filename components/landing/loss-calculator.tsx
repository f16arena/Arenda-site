"use client"

import { useMemo, useState } from "react"
import { Calculator, TrendingDown, AlertTriangle } from "lucide-react"

function fmt(n: number) {
  return Math.round(n).toLocaleString("ru-RU") + " ₸"
}

/**
 * Интерактивный калькулятор потерь без автоматизации.
 * Моделирует упущенную пеню, потери от просрочек и время бухгалтера.
 */
export function LossCalculator() {
  const [tenants, setTenants] = useState(50)
  const [avgRent, setAvgRent] = useState(200_000)
  const [overdueRate, setOverdueRate] = useState(20) // % арендаторов, кто платит с просрочкой
  const [avgOverdueDays, setAvgOverdueDays] = useState(10)
  const [accountantHoursPerMonth, setAccountantHoursPerMonth] = useState(20) // часов на ручные счета/сверки
  const [accountantHourCost, setAccountantHourCost] = useState(3_000)

  const result = useMemo(() => {
    const overdueTenants = (tenants * overdueRate) / 100
    // 1) Упущенная пеня: 1% × дней просрочки × сумма (cap 10%)
    const penaltyPctRaw = Math.min(0.01 * avgOverdueDays, 0.1)
    const lostPenaltyMonthly = overdueTenants * avgRent * penaltyPctRaw

    // 2) Время бухгалтера на ручную работу.
    const accountantCostMonthly = accountantHoursPerMonth * accountantHourCost

    // 3) Потери от просрочек на оборотке (приблизительно: 1.5% годовых × средняя дебиторка)
    //    средняя дебиторка ≈ overdueTenants × avgRent × (avgOverdueDays/30)
    const avgReceivable = overdueTenants * avgRent * (avgOverdueDays / 30)
    const cashflowLossMonthly = avgReceivable * (0.015 / 12) * 12 / 12 // упрощаем: 1.5%/год → /месяц

    const totalMonthly = lostPenaltyMonthly + accountantCostMonthly + cashflowLossMonthly
    const totalYearly = totalMonthly * 12
    return { lostPenaltyMonthly, accountantCostMonthly, cashflowLossMonthly, totalMonthly, totalYearly, overdueTenants }
  }, [tenants, avgRent, overdueRate, avgOverdueDays, accountantHoursPerMonth, accountantHourCost])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Параметры */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Calculator className="h-4 w-4 text-blue-600" />
            Параметры вашего здания
          </div>

          <Field
            label="Арендаторов"
            value={tenants}
            onChange={setTenants}
            min={5}
            max={500}
            step={5}
            suffix=""
          />
          <Field
            label="Средняя аренда, ₸/мес"
            value={avgRent}
            onChange={setAvgRent}
            min={50_000}
            max={2_000_000}
            step={10_000}
            suffix="₸"
          />
          <Field
            label="Доля арендаторов с просрочкой, %"
            value={overdueRate}
            onChange={setOverdueRate}
            min={0}
            max={80}
            step={1}
            suffix="%"
          />
          <Field
            label="Средняя длительность просрочки, дней"
            value={avgOverdueDays}
            onChange={setAvgOverdueDays}
            min={1}
            max={60}
            step={1}
            suffix="дн"
          />
          <Field
            label="Часов бухгалтера/мес на счета и сверки"
            value={accountantHoursPerMonth}
            onChange={setAccountantHoursPerMonth}
            min={0}
            max={160}
            step={2}
            suffix="ч"
          />
          <Field
            label="Стоимость часа бухгалтера, ₸"
            value={accountantHourCost}
            onChange={setAccountantHourCost}
            min={500}
            max={20_000}
            step={500}
            suffix="₸"
          />
        </div>

        {/* Результат */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <TrendingDown className="h-4 w-4 text-red-600" />
            Сколько вы теряете без автоматизации
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50 p-5">
            <p className="text-xs uppercase tracking-wide text-red-600">В год</p>
            <p className="mt-1 text-4xl font-bold text-red-700">{fmt(result.totalYearly)}</p>
            <p className="mt-1 text-xs text-red-500">≈ {fmt(result.totalMonthly)}/мес</p>
          </div>

          <div className="space-y-2 text-sm">
            <Row label="Упущенная пеня" value={fmt(result.lostPenaltyMonthly)} hint="без автоначисления пени теряется доход" />
            <Row label="Ручной труд бухгалтера" value={fmt(result.accountantCostMonthly)} hint={`${accountantHoursPerMonth}ч × ${fmt(accountantHourCost)}`} />
            <Row label="Замороженный кэшфлоу" value={fmt(result.cashflowLossMonthly)} hint="оборотные потери из-за просрочки" />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Приблизительная оценка. Автоматизация (тариф Pro) обычно окупает себя за <b>1–2 месяца</b> при 30+ арендаторах.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, min, max, step, suffix,
}: {
  label: string; value: number; onChange: (v: number) => void
  min: number; max: number; step: number; suffix: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-slate-600">{label}</label>
        <span className="text-sm font-semibold text-slate-900">
          {value.toLocaleString("ru-RU")} {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-blue-600"
      />
    </div>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
      <div className="min-w-0">
        <p className="text-slate-700">{label}</p>
        <p className="text-[11px] text-slate-400">{hint}</p>
      </div>
      <p className="shrink-0 font-semibold text-red-700">{value}</p>
    </div>
  )
}
