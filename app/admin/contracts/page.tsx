export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { formatMoney } from "@/lib/utils"
import { FileText, AlertTriangle, Calendar, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { requireOrgAccess } from "@/lib/org"
import { tenantScope } from "@/lib/tenant-scope"
import { calculateTenantMonthlyRent } from "@/lib/rent"

export default async function ContractsPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()

  const now = new Date()
  const in20Days = new Date(now)
  in20Days.setDate(in20Days.getDate() + 20)

  const tenants = await db.tenant.findMany({
    where: tenantScope(orgId),
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
      space: { select: { number: true, area: true, floor: { select: { name: true, ratePerSqm: true } } } },
      fullFloors: { select: { id: true, name: true, fixedMonthlyRent: true } },
      contracts: { orderBy: { createdAt: "desc" }, take: 1 },
      charges: { where: { isPaid: false }, select: { amount: true, dueDate: true } },
    },
    orderBy: { contractEnd: "asc" },
  })

  const buckets = {
    expired: [] as typeof tenants,
    expiringSoon: [] as typeof tenants,
    active: [] as typeof tenants,
    noContract: [] as typeof tenants,
  }

  for (const t of tenants) {
    if (!t.contractEnd) {
      buckets.noContract.push(t)
    } else if (t.contractEnd < now) {
      buckets.expired.push(t)
    } else if (t.contractEnd < in20Days) {
      buckets.expiringSoon.push(t)
    } else {
      buckets.active.push(t)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Договоры</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
            {tenants.length} арендаторов · {buckets.expiringSoon.length} истекают в ближайшие 20 дней
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Активные" value={buckets.active.length} color="emerald" icon={CheckCircle2} />
        <StatCard label="Истекают (≤ 20 дн)" value={buckets.expiringSoon.length} color="amber" icon={Calendar} />
        <StatCard label="Просрочены" value={buckets.expired.length} color="red" icon={AlertTriangle} />
        <StatCard label="Без договора" value={buckets.noContract.length} color="slate" icon={FileText} />
      </div>

      {buckets.expiringSoon.length > 0 && (
        <Section title="⏰ Скоро истекают (нужно продление)" tenants={buckets.expiringSoon} now={now} highlight="amber" />
      )}
      {buckets.expired.length > 0 && (
        <Section title="🚨 Просрочены — договор не продлён" tenants={buckets.expired} now={now} highlight="red" />
      )}
      {buckets.active.length > 0 && (
        <Section title="✅ Активные договоры" tenants={buckets.active} now={now} />
      )}
      {buckets.noContract.length > 0 && (
        <Section title="❔ Без договора" tenants={buckets.noContract} now={now} />
      )}
    </div>
  )
}

function StatCard({
  label, value, color, icon: Icon,
}: {
  label: string
  value: number
  color: "emerald" | "amber" | "red" | "slate"
  icon: React.ElementType
}) {
  const colors = {
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
    red: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10",
    slate: "text-slate-600 dark:text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50",
  }
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className={cn("inline-flex h-9 w-9 items-center justify-center rounded-lg mb-3", colors[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{label}</p>
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
  contracts: { id: string; number: string; status: string }[]
  charges: { amount: number; dueDate: Date | null }[]
}

function Section({
  title, tenants, now, highlight,
}: {
  title: string
  tenants: TenantRow[]
  now: Date
  highlight?: "amber" | "red"
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50/50">
            <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Арендатор</th>
            <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Помещение</th>
            <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Срок договора</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Аренда/мес</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Долг</th>
            <th className="px-5 py-2" />
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => {
            const debt = t.charges.reduce((s, c) => s + c.amount, 0)
            const monthly = calculateTenantMonthlyRent(t)
            const daysLeft = t.contractEnd
              ? Math.ceil((t.contractEnd.getTime() - now.getTime()) / 86_400_000)
              : null
            const placement = t.fullFloors[0]?.name
              ?? (t.space ? `Каб. ${t.space.number} · ${t.space.floor.name}` : "—")
            return (
              <tr key={t.id} className={cn(
                "border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50",
                highlight === "amber" && "bg-amber-50 dark:bg-amber-500/10/30",
                highlight === "red" && "bg-red-50 dark:bg-red-500/10/30"
              )}>
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{t.companyName}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{t.legalType}</p>
                </td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-400 dark:text-slate-500">{placement}</td>
                <td className="px-5 py-3 text-slate-600 dark:text-slate-400 dark:text-slate-500 text-xs">
                  {t.contractStart && t.contractEnd ? (
                    <>
                      <p>{t.contractStart.toLocaleDateString("ru-RU")} — {t.contractEnd.toLocaleDateString("ru-RU")}</p>
                      {daysLeft !== null && (
                        <p className={cn(
                          "mt-0.5",
                          daysLeft < 0 && "text-red-600 dark:text-red-400 font-medium",
                          daysLeft >= 0 && daysLeft <= 20 && "text-amber-600 dark:text-amber-400 font-medium",
                          daysLeft > 20 && "text-slate-400 dark:text-slate-500"
                        )}>
                          {daysLeft < 0 ? `Просрочен ${Math.abs(daysLeft)} дн.` : `Осталось ${daysLeft} дн.`}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">Не указан</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  {monthly !== null ? formatMoney(monthly) : "—"}
                </td>
                <td className="px-5 py-3 text-right">
                  {debt > 0 ? (
                    <span className="font-medium text-red-600 dark:text-red-400">{formatMoney(debt)}</span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400 text-xs">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex gap-3 justify-end text-xs">
                    <Link href={`/admin/tenants/${t.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">Карточка</Link>
                    <Link
                      href={`/admin/documents/templates/rental?tenantId=${t.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Договор
                    </Link>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
