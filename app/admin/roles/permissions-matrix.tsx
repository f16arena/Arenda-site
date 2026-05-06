"use client"

import { useMemo, useState, useTransition } from "react"
import { Copy, Edit2, Eye, EyeOff, Lock, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { createRole, deleteRole, setPermission } from "@/app/actions/permissions"
import { cn } from "@/lib/utils"
import type { Section } from "@/lib/acl"

type RoleInfo = {
  key: string
  label: string
  color: string
  system: boolean
  userCount: number
}

type SectionInfo = {
  key: Section
  label: string
  requiredFeature: string | null
  requiredFeatureLabel: string | null
  locked: boolean
}

type GroupInfo = {
  key: string
  label: string
  description: string
  sections: Section[]
}

type PermMap = Record<string, Record<string, { canView: boolean; canEdit: boolean }>>

export function PermissionsMatrix({
  roles,
  sections,
  groups,
  permissions,
  editable,
}: {
  roles: RoleInfo[]
  sections: SectionInfo[]
  groups: GroupInfo[]
  permissions: PermMap
  editable: boolean
}) {
  const [perms, setPerms] = useState(permissions)
  const [selectedRole, setSelectedRole] = useState(roles.find((role) => role.key !== "OWNER")?.key ?? roles[0]?.key ?? "")
  const [label, setLabel] = useState("")
  const [sourceRole, setSourceRole] = useState(selectedRole)
  const [pending, startTransition] = useTransition()

  const sectionMap = useMemo(() => new Map(sections.map((section) => [section.key, section])), [sections])
  const selected = roles.find((role) => role.key === selectedRole) ?? roles[0]

  const cycle = (role: RoleInfo, section: SectionInfo) => {
    if (!editable) return
    if (role.key === "OWNER") {
      toast.info("Владелец всегда имеет полный доступ")
      return
    }
    if (section.locked) {
      toast.info(`Раздел закрыт тарифом: ${section.requiredFeatureLabel ?? section.requiredFeature}`)
      return
    }

    const current = perms[role.key]?.[section.key] ?? { canView: false, canEdit: false }
    let next: { canView: boolean; canEdit: boolean }
    if (!current.canView && !current.canEdit) next = { canView: true, canEdit: false }
    else if (current.canView && !current.canEdit) next = { canView: true, canEdit: true }
    else next = { canView: false, canEdit: false }

    setPerms((prev) => ({
      ...prev,
      [role.key]: { ...(prev[role.key] ?? {}), [section.key]: next },
    }))

    startTransition(async () => {
      try {
        await setPermission(role.key, section.key, next.canView, next.canEdit)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось сохранить право")
        setPerms((prev) => ({
          ...prev,
          [role.key]: { ...(prev[role.key] ?? {}), [section.key]: current },
        }))
      }
    })
  }

  const create = (copyFromSelected: boolean) => {
    if (!editable) return
    const fd = new FormData()
    fd.set("label", label)
    fd.set("sourceRole", copyFromSelected ? sourceRole : "")
    startTransition(async () => {
      try {
        await createRole(fd)
        toast.success("Должность создана")
        setLabel("")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось создать должность")
      }
    })
  }

  const remove = (role: RoleInfo) => {
    if (!editable || role.system) return
    const confirmation = window.prompt(`Чтобы удалить должность «${role.label}», напишите: удалить`)
    if (confirmation?.trim().toLowerCase() !== "удалить") return
    startTransition(async () => {
      try {
        await deleteRole(role.key)
        toast.success("Должность удалена")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось удалить должность")
      }
    })
  }

  if (!selected) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
        Нет должностей для настройки.
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-100">Должности</p>
              <p className="mt-1 text-xs text-slate-500">Выберите роль и включайте доступы справа.</p>
            </div>
            <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-400">{roles.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {roles.map((role) => (
              <button
                key={role.key}
                type="button"
                onClick={() => {
                  setSelectedRole(role.key)
                  setSourceRole(role.key)
                }}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left transition",
                  selectedRole === role.key
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-slate-800 bg-slate-950/40 hover:border-slate-700",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", role.color)}>
                    {role.label}
                  </span>
                  <span className="text-xs text-slate-500">{role.userCount} чел.</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {role.system ? "Системная роль" : "Своя должность"}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm font-semibold text-slate-100">Создать должность</p>
          <p className="mt-1 text-xs text-slate-500">
            Например: управляющий, оператор, техник, кассир.
          </p>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={!editable || pending}
            placeholder="Название должности"
            className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <select
            value={sourceRole}
            onChange={(event) => setSourceRole(event.target.value)}
            disabled={!editable || pending}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 disabled:opacity-50"
          >
            {roles.map((role) => (
              <option key={role.key} value={role.key}>{role.label}</option>
            ))}
          </select>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => create(false)}
              disabled={!editable || pending || !label.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Пустая
            </button>
            <button
              type="button"
              onClick={() => create(true)}
              disabled={!editable || pending || !label.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy className="h-4 w-4" />
              Копия
            </button>
          </div>
        </div>
      </aside>

      <section className="rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-800 p-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", selected.color)}>
                {selected.label}
              </span>
              {selected.key === "OWNER" && (
                <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-xs text-purple-200">
                  полный доступ
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Клик по праву переключает: нет доступа → просмотр → редактирование → нет доступа.
            </p>
          </div>
          {!selected.system && (
            <button
              type="button"
              onClick={() => remove(selected)}
              disabled={!editable || pending || selected.userCount > 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
              title={selected.userCount > 0 ? "Сначала переназначьте пользователей на другую должность" : "Удалить должность"}
            >
              <Trash2 className="h-4 w-4" />
              Удалить
            </button>
          )}
        </div>

        <div className="space-y-5 p-5">
          {groups.map((group) => (
            <div key={group.key} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="mb-3">
                <p className="text-sm font-semibold text-slate-100">{group.label}</p>
                <p className="mt-1 text-xs text-slate-500">{group.description}</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {group.sections.map((sectionKey) => {
                  const section = sectionMap.get(sectionKey)
                  if (!section) return null
                  const current = selected.key === "OWNER"
                    ? { canView: true, canEdit: true }
                    : (perms[selected.key]?.[section.key] ?? { canView: false, canEdit: false })
                  return (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => cycle(selected, section)}
                      disabled={!editable || selected.key === "OWNER" || section.locked}
                      className={cn(
                        "flex min-h-16 items-start justify-between gap-3 rounded-lg border p-3 text-left transition",
                        section.locked
                          ? "border-slate-800 bg-slate-900/80 opacity-60"
                          : current.canEdit
                            ? "border-blue-500/40 bg-blue-500/10"
                            : current.canView
                              ? "border-emerald-500/40 bg-emerald-500/10"
                              : "border-slate-800 bg-slate-900 hover:border-slate-700",
                        editable && selected.key !== "OWNER" && !section.locked ? "cursor-pointer" : "cursor-default",
                      )}
                    >
                      <span>
                        <span className="block text-sm font-medium text-slate-100">{section.label}</span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {section.locked
                            ? `Закрыто тарифом: ${section.requiredFeatureLabel ?? section.requiredFeature}`
                            : current.canEdit
                              ? "Можно смотреть и менять данные"
                              : current.canView
                                ? "Можно только смотреть"
                                : "Не видит раздел и действия"}
                        </span>
                      </span>
                      <span className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold",
                        section.locked
                          ? "border-slate-700 text-slate-500"
                          : current.canEdit
                            ? "border-blue-500/40 text-blue-300"
                            : current.canView
                              ? "border-emerald-500/40 text-emerald-300"
                              : "border-slate-700 text-slate-500",
                      )}>
                        {section.locked ? <Lock className="h-3.5 w-3.5" />
                          : current.canEdit ? <Edit2 className="h-3.5 w-3.5" />
                            : current.canView ? <Eye className="h-3.5 w-3.5" />
                              : <EyeOff className="h-3.5 w-3.5" />}
                        {section.locked ? "тариф" : current.canEdit ? "edit" : current.canView ? "view" : "off"}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
