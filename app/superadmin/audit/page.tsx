export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { History, User } from "lucide-react"
import { cn } from "@/lib/utils"

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  UPDATE: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300",
  DELETE: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300",
  LOGIN: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
}

export default async function SuperadminAuditPage() {
  await requirePlatformOwner()

  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  }).catch(() => [])

  // Подгрузим данные пользователей и их организации
  const userIds = Array.from(new Set(logs.map((l) => l.userId).filter(Boolean) as string[]))
  const users = userIds.length > 0
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
      })
    : []
  const userOrgMap = new Map(users.map((u) => [u.id, u.organization]))

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-500/10">
          <History className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Журнал платформы</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Последние {logs.length} действий по всем организациям</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Время</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Организация</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Пользователь</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Действие</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Объект</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center">
                <History className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">Нет записей</p>
              </td></tr>
            ) : logs.map((l) => {
              const org = l.userId ? userOrgMap.get(l.userId) : null
              return (
                <tr key={l.id} className="border-b border-slate-50">
                  <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {new Date(l.createdAt).toLocaleString("ru-RU", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    {org ? (
                      <span className="text-xs text-slate-700 dark:text-slate-300 font-mono">{org.slug}</span>
                    ) : (
                      <span className="text-xs text-purple-600 dark:text-purple-400 font-mono">PLATFORM</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {l.userName ? (
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{l.userName}</span>
                        {l.userRole && <span className="text-[10px] text-slate-400 dark:text-slate-500">({l.userRole})</span>}
                      </div>
                    ) : <span className="text-slate-400 dark:text-slate-500">Система</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium", ACTION_COLORS[l.action] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500")}>
                      {l.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 dark:text-slate-500 text-xs">{l.entity}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400 dark:text-slate-500 font-mono">{l.ip ?? "—"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
