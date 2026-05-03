import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatMoney, formatPeriod, CHARGE_TYPES } from "@/lib/utils"
import { Copy } from "lucide-react"
import { calculateTenantMonthlyRent, calculateTenantRatePerSqm, hasFixedTenantRent } from "@/lib/rent"

const REQUISITES = {
  bank: "Народный Банк Казахстана",
  bik: "HSBKKZKX",
  iin: "123456789012",
  account: "KZ00 000X XXXX XXXX XXXX",
  recipient: 'ТОО "Управляющая компания"',
}

export default async function CabinetFinances() {
  const session = await auth()

  const tenant = await db.tenant.findUnique({
    where: { userId: session!.user.id },
    include: {
      charges: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { paymentDate: "desc" } },
      space: { include: { floor: true } },
      fullFloors: true,
    },
  })

  if (!tenant) return null

  const totalDebt = tenant.charges.filter((c) => !c.isPaid).reduce((s, c) => s + c.amount, 0)
  const fullFloor = tenant.fullFloors[0]
  const area = fullFloor?.totalArea ?? tenant.space?.area ?? 0
  const rate = calculateTenantRatePerSqm(tenant) ?? 0
  const monthlyRent = calculateTenantMonthlyRent(tenant)

  const byPeriod = tenant.charges.reduce<Record<string, typeof tenant.charges>>((acc, c) => {
    acc[c.period] = acc[c.period] ?? []
    acc[c.period].push(c)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Финансы</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Начисления и оплаты</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <p className={`text-2xl font-bold ${totalDebt > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {formatMoney(totalDebt)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Задолженность</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{area} м²</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Площадь</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {hasFixedTenantRent(tenant.fixedMonthlyRent) ? "Фикс. сумма" : `Ставка: ${formatMoney(rate)}/м²`}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatMoney(monthlyRent)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Аренда в месяц</p>
        </div>
      </div>

      {/* Requisites */}
      <div className="bg-slate-900 rounded-xl p-5 text-white">
        <h2 className="text-sm font-semibold mb-3">Реквизиты для оплаты</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {Object.entries({
            Получатель: REQUISITES.recipient,
            Банк: REQUISITES.bank,
            "БИК": REQUISITES.bik,
            "Счёт": REQUISITES.account,
          }).map(([k, v]) => (
            <div key={k}>
              <p className="text-xs text-slate-400 dark:text-slate-500">{k}</p>
              <p className="text-slate-200 mt-0.5">{v}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
          Назначение платежа: Аренда помещения №{tenant.space?.number ?? "—"}, {tenant.companyName}
        </p>
      </div>

      {/* Charges by period */}
      <div className="space-y-3">
        {Object.entries(byPeriod)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([period, periodCharges]) => {
            const periodTotal = periodCharges.reduce((s, c) => s + c.amount, 0)
            const periodPaid = periodCharges.filter((c) => c.isPaid).reduce((s, c) => s + c.amount, 0)

            return (
              <div key={period} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatPeriod(period)}</h3>
                  <div className="text-right text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {formatMoney(periodPaid)} / {formatMoney(periodTotal)}
                  </div>
                </div>
                <div className="divide-y divide-slate-50">
                  {periodCharges.map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm text-slate-700 dark:text-slate-300">{CHARGE_TYPES[c.type] ?? c.type}</p>
                        {c.description && <p className="text-xs text-slate-400 dark:text-slate-500">{c.description}</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatMoney(c.amount)}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.isPaid ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400"}`}>
                          {c.isPaid ? "Оплачено" : "Долг"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

        {tenant.charges.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 py-16 text-center">
            <p className="text-sm text-slate-400 dark:text-slate-500">Начислений нет</p>
          </div>
        )}
      </div>
    </div>
  )
}
