export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, FileText } from "lucide-react"
import { formatMoney } from "@/lib/utils"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { CabinetPrintButton } from "../print-button"

const MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
]

/**
 * Печатная форма «Счёт на оплату» в кабинете арендатора.
 * Тенант видит свои открытые charges за указанный период (по умолчанию — текущий)
 * и реквизиты арендодателя для оплаты. Стилевой паттерн копирует
 * /admin/documents/templates/invoice — те же print-area / no-print классы и
 * grid 2 колонки «Поставщик / Получатель».
 */
export default async function CabinetInvoicePrint({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const { period } = await searchParams
  const currentPeriod = period ?? new Date().toISOString().slice(0, 7)

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    include: {
      user: { select: { organizationId: true } },
      charges: {
        where: { period: currentPeriod, isPaid: false },
        orderBy: { createdAt: "asc" },
      },
      contracts: {
        where: { status: "SIGNED", deletedAt: null },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { id: true, number: true },
      },
    },
  })

  if (!tenant) redirect("/cabinet/documents")

  const orgId = tenant.user.organizationId ?? session.user.organizationId
  const landlord = orgId ? await getOrganizationRequisites(orgId) : null
  const today = new Date()
  const periodLabel = `${MONTHS[parseInt(currentPeriod.split("-")[1]) - 1]} ${currentPeriod.split("-")[0]}`
  const dueDate = new Date(today.getFullYear(), today.getMonth(), tenant.paymentDueDay)
  const invoiceNumber = `${currentPeriod.replace("-", "")}-${tenant.id.slice(-3).toUpperCase()}`
  const total = tenant.charges.reduce((sum, c) => sum + c.amount, 0)
  const activeContract = tenant.contracts[0] ?? null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Link href="/cabinet/documents" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Счёт на оплату</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{periodLabel}</p>
          </div>
        </div>
        <CabinetPrintButton />
      </div>

      {tenant.charges.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 py-16 text-center">
          <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400 dark:text-slate-500">За период {periodLabel} нет открытых начислений.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 print-area">
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">СЧЁТ НА ОПЛАТУ № {invoiceNumber}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">от {today.toLocaleDateString("ru-RU")}</p>
            {activeContract && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">по договору № {activeContract.number}</p>
            )}
            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium mt-2">Срок оплаты: до {dueDate.toLocaleDateString("ru-RU")}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Поставщик:</p>
              {landlord ? (
                <>
                  <p className="text-slate-700 dark:text-slate-300">{landlord.fullName}</p>
                  <p className="text-slate-500 dark:text-slate-400">{landlord.legalAddress}</p>
                  <p className="text-slate-500 dark:text-slate-400">{landlord.taxIdLabel}: {landlord.taxId}</p>
                  <p className="text-slate-500 dark:text-slate-400">Банк: {landlord.bank}</p>
                  <p className="text-slate-500 dark:text-slate-400">ИИК: {landlord.iik}</p>
                  <p className="text-slate-500 dark:text-slate-400">БИК: {landlord.bik}</p>
                </>
              ) : (
                <p className="text-slate-500 dark:text-slate-400">Реквизиты арендодателя не настроены</p>
              )}
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Получатель:</p>
              <p className="text-slate-700 dark:text-slate-300">{tenant.companyName}</p>
              {tenant.legalAddress && <p className="text-slate-500 dark:text-slate-400">{tenant.legalAddress}</p>}
              {tenant.bin && <p className="text-slate-500 dark:text-slate-400">БИН: {tenant.bin}</p>}
              {tenant.iin && !tenant.bin && <p className="text-slate-500 dark:text-slate-400">ИИН: {tenant.iin}</p>}
              {tenant.bankName && <p className="text-slate-500 dark:text-slate-400">Банк: {tenant.bankName}</p>}
              {tenant.iik && <p className="text-slate-500 dark:text-slate-400">ИИК: {tenant.iik}</p>}
              {tenant.bik && <p className="text-slate-500 dark:text-slate-400">БИК: {tenant.bik}</p>}
            </div>
          </div>

          <table className="w-full text-sm border-collapse mb-4">
            <thead>
              <tr className="border border-slate-300 bg-slate-50 dark:bg-slate-800/50">
                <th className="border border-slate-300 px-3 py-2 text-left text-xs">№</th>
                <th className="border border-slate-300 px-3 py-2 text-left text-xs">Наименование</th>
                <th className="border border-slate-300 px-3 py-2 text-right text-xs">Период</th>
                <th className="border border-slate-300 px-3 py-2 text-right text-xs">Сумма ₸</th>
              </tr>
            </thead>
            <tbody>
              {tenant.charges.map((c, i) => (
                <tr key={c.id}>
                  <td className="border border-slate-300 px-3 py-2 text-xs">{i + 1}</td>
                  <td className="border border-slate-300 px-3 py-2 text-xs">{c.description ?? c.type}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right text-xs">{c.period}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right text-xs">{formatMoney(c.amount)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 dark:bg-slate-800/50 font-semibold">
                <td colSpan={3} className="border border-slate-300 px-3 py-2 text-right text-xs">Всего к оплате:</td>
                <td className="border border-slate-300 px-3 py-2 text-right text-xs">{formatMoney(total)}</td>
              </tr>
            </tbody>
          </table>

          <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">
            <b>Назначение платежа:</b> «Оплата за аренду по счёту № {invoiceNumber} от {today.toLocaleDateString("ru-RU")}{activeContract ? `, договор № ${activeContract.number}` : ""}»
          </p>
        </div>
      )}
    </div>
  )
}
