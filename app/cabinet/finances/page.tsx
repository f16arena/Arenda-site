import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatMoney, formatPeriod, CHARGE_TYPES, PAYMENT_METHOD_LABELS } from "@/lib/utils"
import { calculateTenantMonthlyRent, calculateTenantRatePerSqm, hasFixedTenantRent } from "@/lib/rent"
import { formatTenantPlacement, getTenantAreaTotal } from "@/lib/tenant-placement"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { PaymentPanel } from "./payment-panel"

export default async function CabinetFinances() {
  const session = await auth()

  const tenant = await db.tenant.findUnique({
    where: { userId: session!.user.id },
    include: {
      user: { select: { organizationId: true } },
      charges: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { paymentDate: "desc" } },
      paymentReports: {
        where: { status: { in: ["PENDING", "DISPUTED", "REJECTED"] } },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
      space: { include: { floor: true } },
      tenantSpaces: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: { space: { include: { floor: true } } },
      },
      fullFloors: true,
    },
  })

  if (!tenant) return null

  const totalDebt = tenant.charges.filter((c) => !c.isPaid).reduce((s, c) => s + c.amount, 0)
  const area = getTenantAreaTotal(tenant)
  const rate = calculateTenantRatePerSqm(tenant) ?? 0
  const monthlyRent = calculateTenantMonthlyRent(tenant)
  const hasFullFloorFixedRent = tenant.fullFloors.some((floor) => hasFixedTenantRent(floor.fixedMonthlyRent))
  const currentPeriod = new Date().toISOString().slice(0, 7)
  const placement = formatTenantPlacement(tenant, {
    includeFloorName: false,
    emptyLabel: "помещение по договору",
  })
  const paymentPurpose = `Аренда ${placement}, ${tenant.companyName}, период ${currentPeriod}`
  const landlord = await getOrganizationRequisites(tenant.user.organizationId ?? session!.user.organizationId!)
  const requisites = {
    recipient: landlord.fullName,
    iin: landlord.taxId,
    accounts: landlord.bankAccounts.map((account) => ({
      label: account.label,
      bank: account.bank,
      bik: account.bik,
      account: account.iik,
      isPrimary: account.isPrimary,
    })),
  }
  const primaryAccount = requisites.accounts[0]
  const qrText = [
    `Получатель: ${requisites.recipient}`,
    `ИИН/БИН: ${requisites.iin}`,
    `Банк: ${primaryAccount.bank}`,
    `БИК: ${primaryAccount.bik}`,
    `ИИК: ${primaryAccount.account}`,
    `Назначение: ${paymentPurpose}`,
    `Сумма к оплате: ${formatMoney(totalDebt > 0 ? totalDebt : monthlyRent)}`,
  ].join("\n")
  const qrDataUrl = await import("qrcode")
    .then((mod) => mod.default.toDataURL(qrText, { margin: 1, width: 180 }))
    .catch(() => null)

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

      <div className="grid gap-4 sm:grid-cols-3">
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
            {hasFixedTenantRent(tenant.fixedMonthlyRent) || hasFullFloorFixedRent ? "Фикс. сумма" : `Ставка: ${formatMoney(rate)}/м²`}
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

      {tenant.paymentReports.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-800/50">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Отправленные чеки и оплаты</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Здесь видно, что уже отправлено администратору на проверку.
            </p>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {tenant.paymentReports.map((report) => (
              <div key={report.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatMoney(report.amount)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(report.paymentDate).toLocaleDateString("ru-RU")} · {PAYMENT_METHOD_LABELS[report.method] ?? report.method}
                    {report.receiptName ? ` · чек: ${report.receiptName}` : ""}
                  </p>
                </div>
                <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${
                  report.status === "DISPUTED"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                    : report.status === "REJECTED"
                      ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                }`}>
                  {report.status === "DISPUTED" ? "Требует уточнения" : report.status === "REJECTED" ? "Отклонено" : "На проверке"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

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
                    {new Date(payment.paymentDate).toLocaleDateString("ru-RU")} · {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
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
