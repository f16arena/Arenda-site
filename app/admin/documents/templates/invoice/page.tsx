export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { TenantSelector } from "../tenant-selector"
import { formatMoney } from "@/lib/utils"
import Link from "next/link"
import { ArrowLeft, Download, FileText } from "lucide-react"
import { requireOrgAccess } from "@/lib/org"
import { tenantScope } from "@/lib/tenant-scope"
import { suggestDocumentNumber } from "@/lib/document-numbering"
import { NcaSignButton } from "@/components/nca-sign-button"
import { PeriodPicker } from "@/components/documents/period-picker"
import { DocumentArchive } from "@/components/documents/document-archive"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { ORGANIZATION_REQUISITES_SELECT, organizationToRequisites } from "@/lib/organization-requisites"

const MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
]

export default async function InvoicePage({ searchParams }: { searchParams: Promise<{ tenantId?: string; period?: string; number?: string }> }) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()

  const { tenantId, period, number } = await searchParams
  const currentPeriod = period ?? new Date().toISOString().slice(0, 7)

  const tenants = await db.tenant.findMany({
    where: tenantScope(orgId),
    select: { id: true, companyName: true, space: { select: { number: true } }, user: { select: { name: true } } },
    orderBy: { companyName: "asc" },
  })

  const [organization, tenant] = await Promise.all([
    db.organization.findUnique({
      where: { id: orgId },
      select: { ...ORGANIZATION_REQUISITES_SELECT, isVatPayer: true, vatRate: true },
    }),
    tenantId ? db.tenant.findUnique({
      where: { id: tenantId },
      include: {
        user: true,
        space: { include: { floor: true } },
        fullFloors: true,
        charges: { where: { period: currentPeriod }, orderBy: { createdAt: "asc" } },
        contracts: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }) : null,
  ])

  const building = await db.building.findFirst({ where: { organizationId: orgId } })
  const today = new Date()
  const landlord = organizationToRequisites(organization)
  const periodLabel = `${MONTHS[parseInt(currentPeriod.split("-")[1]) - 1]} ${currentPeriod.split("-")[0]}`
  const dueDate = tenant ? new Date(today.getFullYear(), today.getMonth(), tenant.paymentDueDay) : null

  const suggestedNumber = building && !number
    ? await suggestDocumentNumber(building.id, "invoice").catch(() => null)
    : null
  const invoiceNumber = number ?? suggestedNumber ?? `${currentPeriod.replace("-", "")}-001`

  const items: { name: string; qty: number; unit: string; price: number; amount: number }[] = []
  if (tenant) {
    if (tenant.charges.length > 0) {
      for (const c of tenant.charges) {
        items.push({
          name: c.description ?? c.type,
          qty: 1, unit: "услуга",
          price: c.amount, amount: c.amount,
        })
      }
    } else {
      const fullFloor = tenant.fullFloors?.[0]
      const monthlyRent = calculateTenantMonthlyRent(tenant)
      const placement = fullFloor?.name ?? (tenant.space ? `Каб. ${tenant.space.number}, ${tenant.space.floor.name}` : "по договору")
      items.push({ name: `Аренда нежилого помещения (${placement}) за ${periodLabel}`, qty: 1, unit: "мес", price: monthlyRent, amount: monthlyRent })
      if (tenant.needsCleaning && tenant.cleaningFee > 0) {
        items.push({ name: `Уборка помещения за ${periodLabel}`, qty: 1, unit: "мес", price: tenant.cleaningFee, amount: tenant.cleaningFee })
      }
    }
  }

  const subtotal = items.reduce((s, it) => s + it.amount, 0)
  const withVat = !!organization?.isVatPayer
  const vatRate = organization?.vatRate ?? 12
  const vatAmount = withVat ? Math.round(subtotal * vatRate / 100) : 0
  const total = subtotal + vatAmount

  const docxUrl = tenant
    ? `/api/invoices/generate?tenantId=${tenant.id}&period=${currentPeriod}&number=${encodeURIComponent(invoiceNumber)}`
    : null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Link href="/admin/finances" className="text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:text-slate-100">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Счёт на оплату</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{periodLabel} · {organization?.name ?? landlord.shortName}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodPicker value={currentPeriod} />
          <div className="w-64">
            <TenantSelector tenants={tenants.map((t) => ({ id: t.id, companyName: t.companyName, userName: t.user.name, spaceNumber: t.space?.number }))} selectedId={tenantId} />
          </div>
          {docxUrl && (
            <>
              <a href={docxUrl} download className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white inline-flex items-center gap-2">
                <Download className="h-4 w-4" /> Скачать DOCX
              </a>
              <NcaSignButton documentUrl={docxUrl} documentType="INVOICE" documentRef={invoiceNumber} />
            </>
          )}
        </div>
      </div>

      {!tenant && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 py-16 text-center">
          <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400 dark:text-slate-500">Выберите арендатора для формирования счёта</p>
        </div>
      )}

      {tenant && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 print-area">
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">СЧЁТ НА ОПЛАТУ № {invoiceNumber}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500 mt-1">от {today.toLocaleDateString("ru-RU")}</p>
            {tenant.contracts[0] && <p className="text-sm text-slate-600 dark:text-slate-400 dark:text-slate-500 mt-1">по договору № {tenant.contracts[0].number}</p>}
            {dueDate && <p className="text-sm text-slate-700 dark:text-slate-300 font-medium mt-2">Срок оплаты: до {dueDate.toLocaleDateString("ru-RU")}</p>}
          </div>

          <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Поставщик:</p>
              <p className="text-slate-700 dark:text-slate-300">{landlord.fullName}</p>
              <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">{landlord.legalAddress}</p>
              <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">{landlord.taxIdLabel}: {landlord.taxId}</p>
              <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Банк: {landlord.bank}</p>
              <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">ИИК: {landlord.iik}</p>
              <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">БИК: {landlord.bik}</p>
              {landlord.secondIik && (
                <>
                  <p className="mt-2 text-slate-500 dark:text-slate-400 dark:text-slate-500">Второй банк: {landlord.secondBank}</p>
                  <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">ИИК 2: {landlord.secondIik}</p>
                  <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">БИК 2: {landlord.secondBik}</p>
                </>
              )}
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Получатель:</p>
              <p className="text-slate-700 dark:text-slate-300">{tenant.companyName}</p>
              {tenant.legalAddress && <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">{tenant.legalAddress}</p>}
              {tenant.bin && <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">БИН: {tenant.bin}</p>}
              {tenant.bankName && <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">Банк: {tenant.bankName}</p>}
              {tenant.iik && <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">ИИК: {tenant.iik}</p>}
              {tenant.bik && <p className="text-slate-500 dark:text-slate-400 dark:text-slate-500">БИК: {tenant.bik}</p>}
            </div>
          </div>

          <table className="w-full text-sm border-collapse mb-4">
            <thead>
              <tr className="border border-slate-300 bg-slate-50 dark:bg-slate-800/50">
                <th className="border border-slate-300 px-3 py-2 text-left text-xs">№</th>
                <th className="border border-slate-300 px-3 py-2 text-left text-xs">Наименование</th>
                <th className="border border-slate-300 px-3 py-2 text-right text-xs">Кол-во</th>
                <th className="border border-slate-300 px-3 py-2 text-right text-xs">Цена</th>
                <th className="border border-slate-300 px-3 py-2 text-right text-xs">Сумма ₸</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="border border-slate-300 px-3 py-2 text-xs">{i + 1}</td>
                  <td className="border border-slate-300 px-3 py-2 text-xs">{it.name}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right text-xs">{it.qty} {it.unit}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right text-xs">{formatMoney(it.price)}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right text-xs">{formatMoney(it.amount)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} className="border border-slate-300 px-3 py-2 text-right text-xs">Итого:</td>
                <td className="border border-slate-300 px-3 py-2 text-right text-xs">{formatMoney(subtotal)}</td>
              </tr>
              {withVat && (
                <tr>
                  <td colSpan={4} className="border border-slate-300 px-3 py-2 text-right text-xs">в т.ч. НДС {vatRate}%:</td>
                  <td className="border border-slate-300 px-3 py-2 text-right text-xs">{formatMoney(vatAmount)}</td>
                </tr>
              )}
              <tr className="bg-slate-50 dark:bg-slate-800/50 font-semibold">
                <td colSpan={4} className="border border-slate-300 px-3 py-2 text-right text-xs">Всего к оплате:</td>
                <td className="border border-slate-300 px-3 py-2 text-right text-xs">{formatMoney(total)}</td>
              </tr>
            </tbody>
          </table>

          {!withVat && <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">Без НДС (поставщик не плательщик НДС).</p>}

          <p className="text-sm text-slate-700 dark:text-slate-300 mb-2"><b>Назначение платежа:</b> «Оплата за аренду по счёту № {invoiceNumber} от {today.toLocaleDateString("ru-RU")}{tenant.contracts[0] ? `, договор № ${tenant.contracts[0].number}` : ""}»</p>

          <div className="grid grid-cols-2 gap-12 mt-12 text-sm">
            <div>
              <p className="font-semibold mb-8">Поставщик:</p>
              <p className="border-b border-slate-400 pb-1 text-center">_____________ {landlord.directorShort}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 text-center mt-1">подпись · М.П.</p>
            </div>
          </div>
        </div>
      )}

      <DocumentArchive organizationId={orgId} documentType="INVOICE" period={currentPeriod} />
    </div>
  )
}
