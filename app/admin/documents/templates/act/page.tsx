export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { TenantSelector } from "../tenant-selector"
import { LANDLORD } from "@/lib/landlord"
import { formatMoney } from "@/lib/utils"
import Link from "next/link"
import { ArrowLeft, Download, FileText } from "lucide-react"
import { requireOrgAccess } from "@/lib/org"
import { tenantScope } from "@/lib/tenant-scope"
import { suggestDocumentNumber } from "@/lib/document-numbering"
import { NcaSignButton } from "@/components/nca-sign-button"

const MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
]

export default async function ActPage({ searchParams }: { searchParams: Promise<{ tenantId?: string; period?: string; number?: string }> }) {
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

  const [organization, tenant, building] = await Promise.all([
    db.organization.findUnique({
      where: { id: orgId },
      select: { isVatPayer: true, vatRate: true, name: true },
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
    db.building.findFirst({ where: { organizationId: orgId } }),
  ])

  const today = new Date()
  const [py, pm] = currentPeriod.split("-").map(Number)
  const periodStart = new Date(py, pm - 1, 1)
  const periodEnd = new Date(py, pm, 0)
  const periodLabel = `${MONTHS[pm - 1]} ${py}`

  const suggestedNumber = building && !number
    ? await suggestDocumentNumber(building.id, "act").catch(() => null)
    : null
  const actNumber = number ?? suggestedNumber ?? `${currentPeriod.replace("-", "")}-001`

  const items: { name: string; amount: number }[] = []
  if (tenant) {
    if (tenant.charges.length > 0) {
      for (const c of tenant.charges) items.push({ name: c.description ?? c.type, amount: c.amount })
    } else {
      const fullFloor = tenant.fullFloors?.[0]
      const monthlyRent = fullFloor?.fixedMonthlyRent
        ?? (tenant.space ? tenant.space.area * (tenant.customRate ?? tenant.space.floor.ratePerSqm) : 0)
      const placement = fullFloor?.name ?? (tenant.space ? `Каб. ${tenant.space.number}, ${tenant.space.floor.name}` : "")
      items.push({ name: `Аренда нежилого помещения${placement ? ` (${placement})` : ""} за ${periodLabel}`, amount: monthlyRent })
      if (tenant.needsCleaning && tenant.cleaningFee > 0) items.push({ name: `Уборка за ${periodLabel}`, amount: tenant.cleaningFee })
    }
  }
  const subtotal = items.reduce((s, it) => s + it.amount, 0)
  const withVat = !!organization?.isVatPayer
  const vatRate = organization?.vatRate ?? 12
  const vatAmount = withVat ? Math.round(subtotal * vatRate / 100) : 0
  const total = subtotal + vatAmount

  const docxUrl = tenant
    ? `/api/acts/generate?tenantId=${tenant.id}&period=${currentPeriod}&number=${encodeURIComponent(actNumber)}`
    : null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Link href="/admin/finances" className="text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Акт оказанных услуг</h1>
            <p className="text-sm text-slate-500 mt-0.5">{periodLabel} · {organization?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-64">
            <TenantSelector tenants={tenants.map((t) => ({ id: t.id, companyName: t.companyName, userName: t.user.name, spaceNumber: t.space?.number }))} selectedId={tenantId} />
          </div>
          {docxUrl && (
            <>
              <a href={docxUrl} download className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white inline-flex items-center gap-2">
                <Download className="h-4 w-4" /> Скачать DOCX
              </a>
              <NcaSignButton documentUrl={docxUrl} documentType="ACT" documentRef={actNumber} />
            </>
          )}
        </div>
      </div>

      {!tenant && (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400">Выберите арендатора для формирования акта</p>
        </div>
      )}

      {tenant && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 print-area">
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-slate-900">АКТ ОКАЗАННЫХ УСЛУГ № {actNumber}</h2>
            <p className="text-sm text-slate-600 mt-1">от {today.toLocaleDateString("ru-RU")}</p>
            {tenant.contracts[0] && <p className="text-sm text-slate-600 mt-1">к договору № {tenant.contracts[0].number}{tenant.contracts[0].startDate ? ` от ${new Date(tenant.contracts[0].startDate).toLocaleDateString("ru-RU")}` : ""}</p>}
            <p className="text-sm text-slate-700 mt-1">Период: с {periodStart.toLocaleDateString("ru-RU")} по {periodEnd.toLocaleDateString("ru-RU")}</p>
          </div>

          <p className="text-sm text-slate-700 mb-4 text-justify">
            Мы, нижеподписавшиеся, <b>{LANDLORD.fullName}</b> (далее — Исполнитель), в лице руководителя {LANDLORD.directorShort},
            с одной стороны, и <b>{tenant.companyName}</b> (далее — Заказчик), в лице {tenant.directorName ?? tenant.user.name},
            с другой стороны, составили настоящий акт о том, что Исполнитель оказал Заказчику следующие услуги в полном объёме и в установленные сроки,
            а Заказчик принял эти услуги без претензий по объёму, качеству и срокам оказания:
          </p>

          <table className="w-full text-sm border-collapse mb-4">
            <thead>
              <tr className="border border-slate-300 bg-slate-50">
                <th className="border border-slate-300 px-3 py-2 text-left text-xs">№</th>
                <th className="border border-slate-300 px-3 py-2 text-left text-xs">Наименование услуги</th>
                <th className="border border-slate-300 px-3 py-2 text-center text-xs">Период</th>
                <th className="border border-slate-300 px-3 py-2 text-right text-xs">Сумма ₸</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="border border-slate-300 px-3 py-2 text-xs">{i + 1}</td>
                  <td className="border border-slate-300 px-3 py-2 text-xs">{it.name}</td>
                  <td className="border border-slate-300 px-3 py-2 text-center text-xs">{periodLabel}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right text-xs">{formatMoney(it.amount)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="border border-slate-300 px-3 py-2 text-right text-xs">Итого:</td>
                <td className="border border-slate-300 px-3 py-2 text-right text-xs">{formatMoney(subtotal)}</td>
              </tr>
              {withVat && (
                <tr>
                  <td colSpan={3} className="border border-slate-300 px-3 py-2 text-right text-xs">в т.ч. НДС {vatRate}%:</td>
                  <td className="border border-slate-300 px-3 py-2 text-right text-xs">{formatMoney(vatAmount)}</td>
                </tr>
              )}
              <tr className="bg-slate-50 font-semibold">
                <td colSpan={3} className="border border-slate-300 px-3 py-2 text-right text-xs">Всего:</td>
                <td className="border border-slate-300 px-3 py-2 text-right text-xs">{formatMoney(total)}</td>
              </tr>
            </tbody>
          </table>

          <p className="text-sm text-slate-700 mb-2">
            Всего на сумму: <b>{formatMoney(total)} тенге</b>{withVat ? `, в т.ч. НДС ${vatRate}% — ${formatMoney(vatAmount)} тенге` : " (без НДС, Исполнитель не плательщик НДС)"}.
          </p>
          <p className="text-sm text-slate-700 mb-8">Услуги оказаны в полном объёме, в установленные сроки. Стороны претензий друг к другу не имеют.</p>

          <div className="grid grid-cols-2 gap-12 text-sm">
            <div>
              <p className="font-semibold mb-1">Исполнитель:</p>
              <p>{LANDLORD.fullName}</p>
              <p className="text-xs text-slate-500">ИИН: {LANDLORD.iin}</p>
              <p className="border-b border-slate-400 mt-12 pb-1 text-center">_____________ {LANDLORD.directorShort}</p>
              <p className="text-xs text-slate-500 text-center mt-1">подпись · М.П.</p>
            </div>
            <div>
              <p className="font-semibold mb-1">Заказчик:</p>
              <p>{tenant.companyName}</p>
              {tenant.bin && <p className="text-xs text-slate-500">БИН: {tenant.bin}</p>}
              {tenant.iin && <p className="text-xs text-slate-500">ИИН: {tenant.iin}</p>}
              <p className="border-b border-slate-400 mt-12 pb-1 text-center">_____________ {tenant.directorName ?? tenant.user.name}</p>
              <p className="text-xs text-slate-500 text-center mt-1">подпись · М.П.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
