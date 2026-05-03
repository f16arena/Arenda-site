import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatMoney, formatPeriod, CHARGE_TYPES } from "@/lib/utils"
import { calculateTenantMonthlyRent, calculateTenantRatePerSqm, hasFixedTenantRent } from "@/lib/rent"
import { LANDLORD } from "@/lib/landlord"
import { PaymentPanel } from "./payment-panel"
import QRCode from "qrcode"

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
  const currentPeriod = new Date().toISOString().slice(0, 7)
  const placement = fullFloor?.name ?? (tenant.space ? `Каб. ${tenant.space.number}` : "помещение по договору")
  const paymentPurpose = `Аренда ${placement}, ${tenant.companyName}, период ${currentPeriod}`
  const requisites = {
    recipient: LANDLORD.fullName,
    iin: LANDLORD.iin,
    bank: LANDLORD.bank,
    bik: LANDLORD.bik,
    account: LANDLORD.iik,
  }
  const qrText = [
    `Получатель: ${requisites.recipient}`,
    `ИИН/БИН: ${requisites.iin}`,
    `Банк: ${requisites.bank}`,
    `БИК: ${requisites.bik}`,
    `ИИК: ${requisites.account}`,
    `Назначение: ${paymentPurpose}`,
    `Сумма к оплате: ${formatMoney(totalDebt > 0 ? totalDebt : monthlyRent)}`,
  ].join("\n")
  const qrDataUrl = await QRCode.toDataURL(qrText, { margin: 1, width: 180 }).catch(() => null)

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

      <PaymentPanel
        requisites={requisites}
        totalDebt={totalDebt}
        monthlyRent={monthlyRent}
        paymentPurpose={paymentPurpose}
        qrDataUrl={qrDataUrl}
      />

      {tenant.payments.length > 0 && (
        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">История оплат</h2>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {tenant.payments.slice(0, 8).map((payment) => (
              <div key={payment.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatMoney(payment.amount)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(payment.paymentDate).toLocaleDateString("ru-RU")} · {payment.method}
                  </p>
                  {payment.note && <p className="text-xs text-slate-400 dark:text-slate-500">{payment.note}</p>}
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                  Проведено
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

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
