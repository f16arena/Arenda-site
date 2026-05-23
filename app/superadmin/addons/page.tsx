export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import Link from "next/link"
import { Package, Clock, CheckCircle2 } from "lucide-react"
import { ADDON_CATALOG } from "@/lib/addons-catalog"
import { ActivateButton, DeactivateButton, RejectButton } from "./client-actions"

type SearchParams = Promise<{ status?: string }>

export default async function SuperadminAddonsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePlatformOwner()
  const { status } = await searchParams
  const filter = status === "active" || status === "all" ? status : "pending"

  const where =
    filter === "pending"
      ? { isActive: false, expiresAt: null }
      : filter === "active"
        ? { isActive: true }
        : {}

  const [addons, pendingCount, activeCount] = await Promise.all([
    db.organizationAddon.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        organization: {
          select: {
            id: true, name: true, slug: true,
            plan: { select: { code: true, name: true } },
          },
        },
      },
    }),
    db.organizationAddon.count({ where: { isActive: false, expiresAt: null } }),
    db.organizationAddon.count({ where: { isActive: true } }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Package className="h-5 w-5 text-purple-500" />
          Аддоны организаций
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Подтверждение оплаченных аддонов и управление активными. Платежи вручную.
        </p>
      </div>

      {/* Фильтр */}
      <div className="flex gap-2">
        <FilterTab href="/superadmin/addons?status=pending" active={filter === "pending"} label={`Заявки (${pendingCount})`} icon={Clock} color="amber" />
        <FilterTab href="/superadmin/addons?status=active" active={filter === "active"} label={`Активные (${activeCount})`} icon={CheckCircle2} color="emerald" />
        <FilterTab href="/superadmin/addons?status=all" active={filter === "all"} label="Все" icon={Package} color="slate" />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {addons.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400 dark:text-slate-500">
            {filter === "pending" ? "Нет заявок на активацию" : filter === "active" ? "Нет активных аддонов" : "Нет аддонов"}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Организация</th>
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Аддон</th>
                <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Кол-во</th>
                <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">₸/мес</th>
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Запрошен</th>
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Статус</th>
                <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Действия</th>
              </tr>
            </thead>
            <tbody>
              {addons.map((a) => {
                const item = ADDON_CATALOG.find((c) => c.code === a.addonCode)
                const total = a.priceMonthly * a.quantity
                return (
                  <tr key={a.id} className="border-b border-slate-50 dark:border-slate-800/60 align-top">
                    <td className="px-5 py-3">
                      <Link href={`/superadmin/orgs/${a.organization.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-purple-600 dark:hover:text-purple-400">
                        {a.organization.name}
                      </Link>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{a.organization.plan?.name ?? "—"}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item?.label ?? a.addonCode}</p>
                      {item?.description && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-xs">{item.description}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-700 dark:text-slate-300">{a.quantity}</td>
                    <td className="px-5 py-3 text-right">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{total.toLocaleString("ru-RU")}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{a.priceMonthly.toLocaleString("ru-RU")} × {a.quantity}</p>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {new Date(a.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {a.notes && <p className="mt-1 text-[10px] text-slate-400 max-w-xs whitespace-pre-line">{a.notes}</p>}
                    </td>
                    <td className="px-5 py-3">
                      {a.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="h-3 w-3" />активен
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                          <Clock className="h-3 w-3" />ожидает
                        </span>
                      )}
                      {a.expiresAt && (
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          до {new Date(a.expiresAt).toLocaleDateString("ru-RU")}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right space-y-1">
                      {a.isActive ? (
                        <DeactivateButton addonId={a.id} />
                      ) : (
                        <div className="flex flex-col gap-1 items-end">
                          <ActivateButton addonId={a.id} />
                          <RejectButton addonId={a.id} />
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function FilterTab({ href, active, label, icon: Icon, color }: {
  href: string
  active: boolean
  label: string
  icon: React.ElementType
  color: "amber" | "emerald" | "slate"
}) {
  const colors = {
    amber: active ? "bg-amber-500 text-white" : "text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10",
    emerald: active ? "bg-emerald-500 text-white" : "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10",
    slate: active ? "bg-slate-600 text-white" : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
  }
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${colors[color]}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  )
}
