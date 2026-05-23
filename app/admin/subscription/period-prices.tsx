import { db } from "@/lib/db"
import { calculatePrice } from "@/lib/pricing"

/**
 * Сравнение цен текущего тарифа по доступным периодам.
 * Информационно: оплата вручную через супер-админа.
 */
export async function PeriodPrices({ planCode, currentPeriod, isFoundersMember, foundersLockedPct }: {
  planCode: string | null
  currentPeriod: string | null
  isFoundersMember: boolean
  foundersLockedPct: number | null
}) {
  if (!planCode || planCode === "FREE") return null
  const periods = await db.billingPeriod.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } })
  const rows = await Promise.all(periods.map(async (p) => {
    try {
      const r = await calculatePrice({
        planCode,
        billingPeriodCode: p.code,
        isFoundersMember,
        foundersLockedPct: foundersLockedPct ?? undefined,
      })
      return { period: p, price: r }
    } catch { return { period: p, price: null } }
  }))

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-x-auto">
      <div className="px-5 py-3.5 border-b border-slate-800">
        <h2 className="text-sm font-semibold text-slate-100">Стоимость по периодам</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {isFoundersMember
            ? "С учётом вашей Founders-скидки −40% lifetime (стэк ограничен 50%)."
            : "Чем длиннее период — тем больше скидка. Founders pricing (если открыто) — −40% lifetime."}
        </p>
      </div>
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-800/50">
            <th className="px-5 py-2 text-left text-xs font-medium text-slate-400">Период</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-400">Цена/мес</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-400">Итого</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-400">Скидка</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ period, price }) => {
            const active = period.code === currentPeriod
            return (
              <tr key={period.code} className={`border-b border-slate-800/60 ${active ? "bg-blue-500/10" : ""}`}>
                <td className="px-5 py-2.5 text-slate-200">
                  {period.name}
                  {active && <span className="ml-2 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">сейчас</span>}
                  {period.bonusMessage && <span className="ml-2 text-[11px] text-emerald-400">{period.bonusMessage}</span>}
                </td>
                <td className="px-5 py-2.5 text-right text-slate-100">
                  {price ? price.pricePerMonth.toLocaleString("ru-RU") + " ₸" : "—"}
                </td>
                <td className="px-5 py-2.5 text-right text-slate-100 font-semibold">
                  {price ? price.totalPriceFinal.toLocaleString("ru-RU") + " ₸" : "—"}
                </td>
                <td className="px-5 py-2.5 text-right text-emerald-400 text-xs">
                  {price && price.appliedDiscountPct > 0 ? `−${price.appliedDiscountPct}%` : "—"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="px-5 py-3 text-xs text-slate-500 border-t border-slate-800">
        Чтобы сменить период — свяжитесь с супер-админом (оплата оформляется вручную).
      </p>
    </div>
  )
}
