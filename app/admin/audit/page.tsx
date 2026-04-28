export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requireOwner } from "@/lib/permissions"
import { History, User, Edit2, Trash2, PlusCircle, LogIn } from "lucide-react"
import { cn } from "@/lib/utils"

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
  LOGIN: "bg-slate-100 text-slate-700",
  LOGOUT: "bg-slate-100 text-slate-500",
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  CREATE: PlusCircle,
  UPDATE: Edit2,
  DELETE: Trash2,
  LOGIN: LogIn,
  LOGOUT: LogIn,
}

const ENTITY_LABELS: Record<string, string> = {
  tenant: "Арендатор",
  building: "Здание",
  floor: "Этаж",
  space: "Помещение",
  charge: "Начисление",
  payment: "Платёж",
  expense: "Расход",
  user: "Пользователь",
  contract: "Договор",
  lead: "Лид",
  tariff: "Тариф",
  meter: "Счётчик",
  request: "Заявка",
  task: "Задача",
}

export default async function AuditPage() {
  await requireOwner()

  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  }).catch(() => [])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
          <History className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Журнал операций</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Последние {logs.length} действий пользователей
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {logs.length === 0 ? (
          <div className="py-16 text-center">
            <History className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Нет записей</p>
            <p className="text-xs text-slate-400 mt-1">Действия начнут логироваться после применения миграции 009</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Время</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Пользователь</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Действие</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Объект</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">ID объекта</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const Icon = ACTION_ICONS[l.action] ?? History
                return (
                  <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {new Date(l.createdAt).toLocaleString("ru-RU", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit", second: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      {l.userName ? (
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-slate-400" />
                          <span className="font-medium text-slate-900">{l.userName}</span>
                          {l.userRole && <span className="text-[10px] text-slate-400">({l.userRole})</span>}
                        </div>
                      ) : (
                        <span className="text-slate-400">Система</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium", ACTION_COLORS[l.action])}>
                        <Icon className="h-3 w-3" />
                        {l.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{ENTITY_LABELS[l.entity] ?? l.entity}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{l.entityId?.slice(0, 12) ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{l.ip ?? "—"}</td>
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
