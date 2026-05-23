export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import Link from "next/link"
import { Briefcase, Clock, CheckCircle2, FileBadge, XCircle } from "lucide-react"
import { MarkPaidButton, MarkDeliveredButton, CancelButton } from "./client-actions"

type SearchParams = Promise<{ status?: string }>

export default async function SuperadminServicesPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePlatformOwner()
  const { status } = await searchParams
  const filter = status === "paid" || status === "delivered" || status === "all" ? status : "pending"

  const where =
    filter === "pending" ? { status: "PENDING" } :
    filter === "paid"    ? { status: "PAID" } :
    filter === "delivered" ? { status: "DELIVERED" } :
    {}

  const [services, pendingCount, paidCount, deliveredCount] = await Promise.all([
    db.organizationService.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        organization: { select: { id: true, name: true, plan: { select: { name: true } } } },
      },
    }),
    db.organizationService.count({ where: { status: "PENDING" } }),
    db.organizationService.count({ where: { status: "PAID" } }),
    db.organizationService.count({ where: { status: "DELIVERED" } }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-purple-500" />
          Разовые услуги
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Заявки на onboarding, юр.пакет, миграцию Excel и др. Оплата вручную.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <FilterTab href="/superadmin/services?status=pending" active={filter === "pending"} label={`Ожидают оплаты (${pendingCount})`} icon={Clock} color="amber" />
        <FilterTab href="/superadmin/services?status=paid" active={filter === "paid"} label={`В работе (${paidCount})`} icon={FileBadge} color="blue" />
        <FilterTab href="/superadmin/services?status=delivered" active={filter === "delivered"} label={`Выполнены (${deliveredCount})`} icon={CheckCircle2} color="emerald" />
        <FilterTab href="/superadmin/services?status=all" active={filter === "all"} label="Все" icon={Briefcase} color="slate" />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {services.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400 dark:text-slate-500">
            {filter === "pending" ? "Нет ожидающих заявок" : "Нет записей"}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Организация</th>
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Услуга</th>
                <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Сумма</th>
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Запрос</th>
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Статус</th>
                <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Действия</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 dark:border-slate-800/60 align-top">
                  <td className="px-5 py-3">
                    <Link href={`/superadmin/orgs/${s.organization.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-purple-600 dark:hover:text-purple-400">
                      {s.organization.name}
                    </Link>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{s.organization.plan?.name ?? "—"}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{s.serviceName}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{s.serviceCode}</p>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{s.price.toLocaleString("ru-RU")} ₸</p>
                    {s.paymentMethod && <p className="text-[10px] text-slate-500 mt-0.5">{s.paymentMethod}</p>}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {new Date(s.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    {s.notes && <p className="mt-1 text-[10px] text-slate-400 max-w-xs whitespace-pre-line">{s.notes}</p>}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={s.status} />
                    {s.paidAt && <p className="text-[10px] text-slate-500 mt-0.5">оплачено {new Date(s.paidAt).toLocaleDateString("ru-RU")}</p>}
                    {s.deliveredAt && <p className="text-[10px] text-slate-500 mt-0.5">сдано {new Date(s.deliveredAt).toLocaleDateString("ru-RU")}</p>}
                  </td>
                  <td className="px-5 py-3 text-right space-y-1">
                    {s.status === "PENDING" && (
                      <div className="flex flex-col gap-1 items-end">
                        <MarkPaidButton serviceId={s.id} />
                        <CancelButton serviceId={s.id} />
                      </div>
                    )}
                    {s.status === "PAID" && (
                      <div className="flex flex-col gap-1 items-end">
                        <MarkDeliveredButton serviceId={s.id} />
                        <CancelButton serviceId={s.id} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string; icon: React.ElementType }> = {
    PENDING:   { cls: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300",     label: "ожидает оплаты", icon: Clock },
    PAID:      { cls: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300",        label: "в работе",       icon: FileBadge },
    DELIVERED: { cls: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300", label: "выполнено",   icon: CheckCircle2 },
    CANCELLED: { cls: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",        label: "отменено",       icon: XCircle },
  }
  const m = map[status] ?? map.PENDING
  const Icon = m.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${m.cls}`}>
      <Icon className="h-3 w-3" />{m.label}
    </span>
  )
}

function FilterTab({ href, active, label, icon: Icon, color }: {
  href: string
  active: boolean
  label: string
  icon: React.ElementType
  color: "amber" | "emerald" | "slate" | "blue"
}) {
  const colors = {
    amber:   active ? "bg-amber-500 text-white"   : "text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10",
    blue:    active ? "bg-blue-500 text-white"    : "text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10",
    emerald: active ? "bg-emerald-500 text-white" : "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10",
    slate:   active ? "bg-slate-600 text-white"   : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
  }
  return (
    <Link href={href} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${colors[color]}`}>
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  )
}
