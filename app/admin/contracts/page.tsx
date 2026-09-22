export const dynamic = "force-dynamic"

import { restrictedBuildingIds, tenantInBuildingIds } from "@/lib/building-access"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { FileText, AlertTriangle, Calendar, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { requireOrgAccess } from "@/lib/org"
import { tenantScope } from "@/lib/tenant-scope"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { formatTenantPlacement } from "@/lib/tenant-placement"
import { contractTypeShort } from "@/lib/contract-placement-types"
import { PageHeader, StatGrid, StatCard, Card } from "@/components/ui/page"
import { RouteTabs } from "@/components/ui/route-tabs"
import { DOCUMENTS_TABS } from "@/lib/hub-tabs"
import { getLocale, getT } from "@/lib/i18n/server"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"
import type { Locale } from "@/lib/i18n/config"

export default async function ContractsPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const locale = await getLocale()
  const { t, tp } = await getT(locale)

  const now = new Date()
  const in20Days = new Date(now)
  in20Days.setDate(in20Days.getDate() + 20)

  const bIds = await restrictedBuildingIds(orgId)
  const tenants = await db.tenant.findMany({
    where: bIds ? { AND: [tenantScope(orgId), tenantInBuildingIds(bIds)] } : tenantScope(orgId),
    select: {
      id: true,
      companyName: true,
      contractStart: true,
      contractEnd: true,
      paymentDueDay: true,
      penaltyPercent: true,
      legalType: true,
      customRate: true,
      fixedMonthlyRent: true,
      // Ступенчатый график и доп. помещения — иначе «аренда в месяц» здесь
      // расходилась с карточкой арендатора и обзором.
      rentSchedule: true,
      tenantSpaces: { select: { space: { select: { area: true, floor: { select: { ratePerSqm: true } } } } } },
      space: { select: { number: true, area: true, kind: true, floor: { select: { name: true, kind: true, ratePerSqm: true } } } },
      fullFloors: { select: { id: true, name: true, fixedMonthlyRent: true } },
      contracts: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
      charges: { where: { deletedAt: null, isPaid: false }, select: { amount: true, dueDate: true } },
    },
    orderBy: { contractEnd: "asc" },
  })

  const buckets = {
    expired: [] as typeof tenants,
    expiringSoon: [] as typeof tenants,
    active: [] as typeof tenants,
    noContract: [] as typeof tenants,
  }

  for (const tenant of tenants) {
    if (!tenant.contractEnd) {
      buckets.noContract.push(tenant)
    } else if (tenant.contractEnd < now) {
      buckets.expired.push(tenant)
    } else if (tenant.contractEnd < in20Days) {
      buckets.expiringSoon.push(tenant)
    } else {
      buckets.active.push(tenant)
    }
  }

  return (
    <div className="space-y-5">
      <RouteTabs items={DOCUMENTS_TABS} className="mb-2" />
      <PageHeader
        icon={FileText}
        title={t("adminDocs.contracts.title")}
        subtitle={`${tp("adminDocs.contracts.tenantsCount", tenants.length)} · ${tp("adminDocs.contracts.expiringCount", buckets.expiringSoon.length)}`}
      />

      {/* Stats */}
      <StatGrid>
        <StatCard label={t("adminDocs.contracts.stats.active")} value={buckets.active.length} tone="emerald" icon={CheckCircle2} />
        <StatCard label={t("adminDocs.contracts.stats.expiring")} value={buckets.expiringSoon.length} tone="amber" icon={Calendar} />
        <StatCard label={t("adminDocs.contracts.stats.expired")} value={buckets.expired.length} tone="red" icon={AlertTriangle} />
        <StatCard label={t("adminDocs.contracts.stats.none")} value={buckets.noContract.length} tone="slate" icon={FileText} />
      </StatGrid>

      {buckets.expiringSoon.length > 0 && (
        <Section title={t("adminDocs.contracts.sections.expiring")} tenants={buckets.expiringSoon} now={now} locale={locale} highlight="amber" />
      )}
      {buckets.expired.length > 0 && (
        <Section title={t("adminDocs.contracts.sections.expired")} tenants={buckets.expired} now={now} locale={locale} highlight="red" />
      )}
      {buckets.active.length > 0 && (
        <Section title={t("adminDocs.contracts.sections.active")} tenants={buckets.active} now={now} locale={locale} />
      )}
      {buckets.noContract.length > 0 && (
        <Section title={t("adminDocs.contracts.sections.none")} tenants={buckets.noContract} now={now} locale={locale} />
      )}
    </div>
  )
}

type TenantRow = {
  id: string
  companyName: string
  contractStart: Date | null
  contractEnd: Date | null
  paymentDueDay: number
  penaltyPercent: number
  legalType: string
  customRate: number | null
  fixedMonthlyRent: number | null
  space: { number: string; area: number; floor: { name: string; ratePerSqm: number } } | null
  fullFloors: { id: string; name: string; fixedMonthlyRent: number | null }[]
  contracts: { id: string; number: string; status: string; placementType?: string | null }[]
  charges: { amount: number; dueDate: Date | null }[]
}

async function Section({
  title, tenants, now, locale, highlight,
}: {
  title: string
  tenants: TenantRow[]
  now: Date
  locale: Locale
  highlight?: "amber" | "red"
}) {
  const { t, tp } = await getT(locale)
  const money = (amount: number) => formatMoneyL(locale, amount)
  const day = (value: Date) => formatDateShortL(locale, value)
  return (
    <Card padded={false} className="overflow-x-auto" title={title}>
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminDocs.contracts.columns.tenant")}</th>
            <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminDocs.contracts.columns.space")}</th>
            <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminDocs.contracts.columns.term")}</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminDocs.contracts.columns.rent")}</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminDocs.contracts.columns.debt")}</th>
            <th className="px-5 py-2" />
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => {
            const debt = tenant.charges.reduce((s, c) => s + c.amount, 0)
            const monthly = calculateTenantMonthlyRent(tenant)
            const daysLeft = tenant.contractEnd
              ? Math.ceil((tenant.contractEnd.getTime() - now.getTime()) / 86_400_000)
              : null
            const placement = formatTenantPlacement(tenant, { emptyLabel: "—" })
            return (
              <tr key={tenant.id} className={cn(
                "border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800/50",
                highlight === "amber" && "bg-amber-50 dark:bg-amber-500/10",
                highlight === "red" && "bg-red-50 dark:bg-red-500/10"
              )}>
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{tenant.companyName}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{tenant.legalType}</p>
                </td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <span>{placement}</span>
                    {tenant.contracts[0]?.placementType && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                        {contractTypeShort(tenant.contracts[0].placementType)}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-400 text-xs">
                  {tenant.contractStart && tenant.contractEnd ? (
                    <>
                      <p>{day(tenant.contractStart)} — {day(tenant.contractEnd)}</p>
                      {daysLeft !== null && (
                        <p className={cn(
                          "mt-0.5",
                          daysLeft < 0 && "text-red-600 dark:text-red-400 font-medium",
                          daysLeft >= 0 && daysLeft <= 20 && "text-amber-600 dark:text-amber-400 font-medium",
                          daysLeft > 20 && "text-slate-400 dark:text-slate-500"
                        )}>
                          {daysLeft < 0
                            ? tp("adminDocs.contracts.overdueDays", Math.abs(daysLeft))
                            : tp("adminDocs.contracts.leftDays", daysLeft)}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">{t("adminDocs.contracts.termUnknown")}</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  {monthly !== null ? money(monthly) : "—"}
                </td>
                <td className="px-5 py-3 text-right">
                  {debt > 0 ? (
                    <span className="font-medium text-red-600 dark:text-red-400">{money(debt)}</span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400 text-xs">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex gap-3 justify-end text-xs">
                    <Link href={`/admin/tenants/${tenant.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{t("adminDocs.contracts.tenantCard")}</Link>
                    {/* Если есть последний контракт — даём прямую ссылку на detail; */}
                    {/* иначе на форму создания нового. */}
                    {tenant.contracts.length > 0 ? (
                      <Link
                        href={`/admin/contracts/${tenant.contracts[0].id}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        № {tenant.contracts[0].number}
                      </Link>
                    ) : (
                      <Link
                        href={`/admin/documents?create=contract&tenantId=${tenant.id}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {t("adminDocs.contracts.createContract")}
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
