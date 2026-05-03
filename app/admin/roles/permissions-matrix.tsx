"use client"

import { useState, useTransition } from "react"
import { Eye, EyeOff, Edit2 } from "lucide-react"
import { toast } from "sonner"
import { setPermission } from "@/app/actions/permissions"
import { cn } from "@/lib/utils"

type RoleInfo = { key: string; label: string; color: string }
type SectionInfo = { key: string; label: string }
type PermMap = Record<string, Record<string, { canView: boolean; canEdit: boolean }>>

export function PermissionsMatrix({
  roles, sections, permissions, editable,
}: {
  roles: RoleInfo[]
  sections: SectionInfo[]
  permissions: PermMap
  editable: boolean
}) {
  const [perms, setPerms] = useState(permissions)
  const [, startTransition] = useTransition()

  const cycle = (role: string, section: string) => {
    if (!editable) return
    if (role === "OWNER") {
      toast.info("Владелец всегда имеет полный доступ")
      return
    }

    const current = perms[role]?.[section] ?? { canView: false, canEdit: false }
    let next: { canView: boolean; canEdit: boolean }
    if (!current.canView && !current.canEdit) next = { canView: true, canEdit: false }
    else if (current.canView && !current.canEdit) next = { canView: true, canEdit: true }
    else next = { canView: false, canEdit: false }

    // Оптимистичное обновление
    setPerms((p) => ({
      ...p,
      [role]: { ...(p[role] ?? {}), [section]: next },
    }))

    startTransition(async () => {
      try {
        await setPermission(role, section, next.canView, next.canEdit)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
        // откат
        setPerms((p) => ({
          ...p,
          [role]: { ...(p[role] ?? {}), [section]: current },
        }))
      }
    })
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 sticky left-0 bg-slate-50 dark:bg-slate-800/50 z-10">Раздел</th>
              {roles.map((r) => (
                <th key={r.key} className="px-2 py-3 text-center min-w-[120px]">
                  <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold", r.color)}>
                    {r.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.key} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50/50">
                <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300 sticky left-0 bg-white dark:bg-slate-900 z-10">{s.label}</td>
                {roles.map((r) => {
                  const isOwner = r.key === "OWNER"
                  const p = isOwner
                    ? { canView: true, canEdit: true }
                    : (perms[r.key]?.[s.key] ?? { canView: false, canEdit: false })
                  return (
                    <td key={r.key} className="px-2 py-2 text-center">
                      <button
                        onClick={() => cycle(r.key, s.key)}
                        disabled={!editable || isOwner}
                        className={cn(
                          "inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors",
                          p.canEdit ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30 hover:bg-blue-200 dark:bg-blue-500/30"
                          : p.canView ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-200 dark:bg-emerald-500/30"
                          : "bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800",
                          editable && !isOwner ? "cursor-pointer" : "cursor-default"
                        )}
                        title={
                          p.canEdit ? "Редактирование (👁 + ✏️). Клик: убрать"
                          : p.canView ? "Просмотр (👁). Клик: разрешить редактирование"
                          : "Нет доступа. Клик: разрешить просмотр"
                        }
                      >
                        {p.canEdit ? <Edit2 className="h-3.5 w-3.5" />
                          : p.canView ? <Eye className="h-3.5 w-3.5" />
                          : <EyeOff className="h-3.5 w-3.5" />}
                        {p.canEdit ? "edit" : p.canView ? "view" : "—"}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
