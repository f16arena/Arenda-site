export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import Link from "next/link"
import { Plus, Building2, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

export default async function OrgsListPage() {
  await requirePlatformOwner()

  const orgs = await db.organization.findMany({
    select: {
      id: true, name: true, slug: true, isActive: true, isSuspended: true,
      planExpiresAt: true, createdAt: true,
      plan: { select: { name: true, code: true, priceMonthly: true } },
      _count: { select: { buildings: true, users: true } },
    },
    orderBy: { createdAt: "desc" },
  }).catch(() => [])

  const now = new Date()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Организации</h1>
          <p className="text-sm text-slate-500 mt-0.5">{orgs.length} клиентов на платформе</p>
        </div>
        <Link
          href="/superadmin/orgs/new"
          className="flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-700 px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          Создать организацию
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Организация</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Тариф</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Истекает</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Зданий</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Юзеров</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Статус</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center">
                <Building2 className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Нет организаций</p>
                <p className="text-xs text-slate-400 mt-1">Создайте первую через кнопку выше</p>
              </td></tr>
            ) : orgs.map((o) => {
              const expired = o.planExpiresAt && o.planExpiresAt < now
              const expiringSoon = o.planExpiresAt && !expired && o.planExpiresAt < new Date(now.getTime() + 7 * 86_400_000)
              return (
                <tr key={o.id} className={cn(
                  "border-b border-slate-50 hover:bg-slate-50",
                  o.isSuspended && "bg-red-50/30",
                  !o.isActive && "opacity-50",
                )}>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-900">{o.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{o.slug}</p>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{o.plan?.name ?? "—"}</td>
                  <td className="px-5 py-3.5 text-xs">
                    {o.planExpiresAt ? (
                      <span className={cn(
                        expired ? "text-red-600 font-medium" :
                        expiringSoon ? "text-amber-600 font-medium" : "text-slate-500"
                      )}>
                        {new Date(o.planExpiresAt).toLocaleDateString("ru-RU")}
                        {expired && " (истёк)"}
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-right text-slate-600">{o._count.buildings}</td>
                  <td className="px-5 py-3.5 text-right text-slate-600">{o._count.users}</td>
                  <td className="px-5 py-3.5">
                    {o.isSuspended ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Приостановлен
                      </span>
                    ) : !o.isActive ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Деактивирован</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Активен</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link href={`/superadmin/orgs/${o.id}`} className="text-xs text-blue-600 hover:underline">Открыть</Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
