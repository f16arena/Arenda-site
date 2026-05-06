"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import { AlertTriangle, Copy, Edit2, Eye, EyeOff, Lock, Plus, Search, ShieldCheck, Trash2, Zap } from "lucide-react"
import { toast } from "sonner"
import { createRole, deleteRole, setCapability, setPermission } from "@/app/actions/permissions"
import { cn } from "@/lib/utils"
import { capabilityPermissionKey } from "@/lib/capability-keys"
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

type CapabilityInfo = {
  key: string
  label: string
  description: string
  section: Section
  level: "view" | "edit" | "sensitive"
  risk: "normal" | "business" | "sensitive"
  requiredFeature: string | null
  requiredFeatureLabel: string | null
  locked: boolean
}

type CapabilityGroupInfo = {
  key: string
  label: string
  description: string
  capabilities: string[]
}

type PermMap = Record<string, Record<string, { canView: boolean; canEdit: boolean }>>
type CapabilityFilter = "all" | "enabled" | "highRisk" | "locked" | "explicit"

const CAPABILITY_FILTERS: Array<{ key: CapabilityFilter; label: string; description: string }> = [
  { key: "all", label: "Все", description: "Все точные действия" },
  { key: "enabled", label: "Включены", description: "Что сейчас разрешено" },
  { key: "highRisk", label: "Риск", description: "Деньги, удаление, доступы" },
  { key: "locked", label: "Тариф", description: "Закрыто тарифом" },
  { key: "explicit", label: "Настроено", description: "Отдельно от раздела" },
]

export function PermissionsMatrix({
  roles,
  sections,
  groups,
  capabilities,
  capabilityGroups,
  permissions,
  editable,
}: {
  roles: RoleInfo[]
  sections: SectionInfo[]
  groups: GroupInfo[]
  capabilities: CapabilityInfo[]
  capabilityGroups: CapabilityGroupInfo[]
  permissions: PermMap
  editable: boolean
}) {
  const [perms, setPerms] = useState(permissions)
  const [selectedRole, setSelectedRole] = useState(roles.find((role) => role.key !== "OWNER")?.key ?? roles[0]?.key ?? "")
  const [label, setLabel] = useState("")
  const [sourceRole, setSourceRole] = useState(selectedRole)
  const [query, setQuery] = useState("")
  const [capabilityFilter, setCapabilityFilter] = useState<CapabilityFilter>("all")
  const [pending, startTransition] = useTransition()

  const sectionMap = useMemo(() => new Map(sections.map((section) => [section.key, section])), [sections])
  const capabilityMap = useMemo(() => new Map(capabilities.map((capability) => [capability.key, capability])), [capabilities])
  const selected = roles.find((role) => role.key === selectedRole) ?? roles[0]

  const capabilityState = useCallback((role: RoleInfo, capability: CapabilityInfo) => {
    if (role.key === "OWNER") return { enabled: true, inherited: true }
    const permissionKey = capabilityPermissionKey(capability.key)
    const explicit = perms[role.key]?.[permissionKey]
    if (explicit) return { enabled: explicit.canView || explicit.canEdit, inherited: false }

    const sectionPerm = perms[role.key]?.[capability.section] ?? { canView: false, canEdit: false }
    const enabled = capability.level === "view" ? sectionPerm.canView : sectionPerm.canEdit
    return { enabled, inherited: true }
  }, [perms])

  const selectedStats = useMemo(() => {
    if (!selected) return { view: 0, edit: 0, enabled: 0, explicit: 0, highRiskEnabled: 0, locked: 0 }
    const rolePerms = selected ? perms[selected.key] ?? {} : {}
    const sectionStats = sections.reduce(
      (acc, section) => {
        const current = selected?.key === "OWNER"
          ? { canView: true, canEdit: true }
          : rolePerms[section.key] ?? { canView: false, canEdit: false }
        if (current.canView) acc.view += 1
        if (current.canEdit) acc.edit += 1
        return acc
      },
      { view: 0, edit: 0 },
    )

    let enabled = 0
    let explicit = 0
    let highRiskEnabled = 0
    let locked = 0
    for (const capability of capabilities) {
      const state = capabilityState(selected, capability)
      if (state.enabled) enabled += 1
      if (!state.inherited) explicit += 1
      if (capability.locked) locked += 1
      if (state.enabled && isHighRiskCapability(capability)) highRiskEnabled += 1
    }

    return { ...sectionStats, enabled, explicit, highRiskEnabled, locked }
  }, [capabilities, capabilityState, perms, sections, selected])

  const selectedHighRiskCapabilities = useMemo(() => (
    !selected ? [] :
    capabilities
      .filter((capability) => capabilityState(selected, capability).enabled && isHighRiskCapability(capability))
      .slice(0, 6)
  ), [capabilities, capabilityState, selected])

  const filteredCapabilityGroups = useMemo(() => {
    if (!selected) return []
    const needle = query.trim().toLowerCase()
    return capabilityGroups
      .map((group) => ({
        ...group,
        capabilities: group.capabilities.filter((key) => {
          const capability = capabilityMap.get(key)
          if (!capability) return false
          const state = capabilityState(selected, capability)
          const matchesFilter =
            capabilityFilter === "all"
              || (capabilityFilter === "enabled" && state.enabled)
              || (capabilityFilter === "highRisk" && isHighRiskCapability(capability))
              || (capabilityFilter === "locked" && capability.locked)
              || (capabilityFilter === "explicit" && !state.inherited)
          if (!matchesFilter) return false
          if (!needle) return true
          return [
            capability.key,
            capability.label,
            capability.description,
            capability.requiredFeatureLabel ?? "",
          ].join(" ").toLowerCase().includes(needle)
        }),
      }))
      .filter((group) => group.capabilities.length > 0)
  }, [capabilityFilter, capabilityGroups, capabilityMap, capabilityState, query, selected])

  const cycleSection = (role: RoleInfo, section: SectionInfo) => {
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

  const toggleCapability = (role: RoleInfo, capability: CapabilityInfo) => {
    if (!editable) return
    if (role.key === "OWNER") {
      toast.info("Владелец всегда имеет все точные права")
      return
    }
    if (capability.locked) {
      toast.info(`Действие закрыто тарифом: ${capability.requiredFeatureLabel ?? capability.requiredFeature}`)
      return
    }

    const permissionKey = capabilityPermissionKey(capability.key)
    const current = capabilityState(role, capability)
    const explicitCurrent = perms[role.key]?.[permissionKey] ?? { canView: current.enabled, canEdit: current.enabled }
    const nextEnabled = !current.enabled
    const next = { canView: nextEnabled, canEdit: nextEnabled }

    setPerms((prev) => ({
      ...prev,
      [role.key]: { ...(prev[role.key] ?? {}), [permissionKey]: next },
    }))

    startTransition(async () => {
      try {
        await setCapability(role.key, capability.key, nextEnabled)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не удалось сохранить точное право")
        setPerms((prev) => ({
          ...prev,
          [role.key]: { ...(prev[role.key] ?? {}), [permissionKey]: explicitCurrent },
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
              <p className="mt-1 text-xs text-slate-500">Роль это пресет: разделы плюс точные действия.</p>
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
          <p className="mt-1 text-xs text-slate-500">Например: управляющий, оператор, техник, кассир.</p>
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
              Сначала включите страницы, затем уточните конкретные действия: кто удаляет, подтверждает оплаты, меняет шаблоны и реквизиты.
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
          <div className="grid gap-3 md:grid-cols-6">
            <RoleStat label="Разделы видит" value={selectedStats.view} />
            <RoleStat label="Разделы меняет" value={selectedStats.edit} />
            <RoleStat label="Действий включено" value={selectedStats.enabled} />
            <RoleStat label="Точно настроено" value={selectedStats.explicit} />
            <RoleStat label="Закрыто тарифом" value={selectedStats.locked} />
            <RoleStat
              label="Рискованных прав"
              value={selectedStats.highRiskEnabled}
              tone={selectedStats.highRiskEnabled > 0 ? "amber" : "slate"}
            />
          </div>

          {selectedHighRiskCapabilities.length > 0 && selected.key !== "OWNER" && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                <div>
                  <p className="text-sm font-semibold text-amber-100">У этой должности есть рискованные права</p>
                  <p className="mt-1 text-xs text-amber-100/75">
                    Проверьте, что сотрудник действительно должен работать с деньгами, удалениями, реквизитами или доступами.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedHighRiskCapabilities.map((capability) => (
                      <span
                        key={capability.key}
                        className="rounded-full border border-amber-500/30 bg-slate-950/40 px-2 py-1 text-[11px] font-medium text-amber-100"
                      >
                        {capability.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-slate-100">Доступ к разделам</p>
              <p className="mt-1 text-xs text-slate-500">
                Клик переключает: нет доступа -&gt; просмотр -&gt; редактирование -&gt; нет доступа.
              </p>
            </div>
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.key}>
                  <div className="mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{group.description}</p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {group.sections.map((sectionKey) => {
                      const section = sectionMap.get(sectionKey)
                      if (!section) return null
                      const current = selected.key === "OWNER"
                        ? { canView: true, canEdit: true }
                        : (perms[selected.key]?.[section.key] ?? { canView: false, canEdit: false })
                      return (
                        <SectionButton
                          key={section.key}
                          section={section}
                          current={current}
                          editable={editable && selected.key !== "OWNER"}
                          onClick={() => cycleSection(selected, section)}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <Zap className="h-4 w-4 text-blue-300" />
                  Точные действия
                </p>
                <p className="mt-1 max-w-2xl text-xs text-slate-500">
                  Это те самые “лампочки”: каждая опасная кнопка и server action проверяются отдельно.
                </p>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Поиск действия..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {CAPABILITY_FILTERS.map((filter) => {
                const active = capabilityFilter === filter.key
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setCapabilityFilter(filter.key)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition",
                      active
                        ? "border-blue-500/40 bg-blue-500/10 text-blue-200"
                        : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700",
                    )}
                    title={filter.description}
                  >
                    <span className="block text-xs font-semibold">{filter.label}</span>
                    <span className="mt-0.5 block text-[10px] opacity-70">{filter.description}</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-4 space-y-4">
              {filteredCapabilityGroups.map((group) => (
                <div key={group.key}>
                  <div className="mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{group.description}</p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {group.capabilities.map((key) => {
                      const capability = capabilityMap.get(key)
                      if (!capability) return null
                      const state = capabilityState(selected, capability)
                      return (
                        <CapabilityButton
                          key={capability.key}
                          capability={capability}
                          enabled={state.enabled}
                          inherited={state.inherited}
                          editable={editable && selected.key !== "OWNER"}
                          onClick={() => toggleCapability(selected, capability)}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
              {filteredCapabilityGroups.length === 0 && (
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-center text-sm text-slate-500">
                  По такому запросу точных действий не найдено.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function RoleStat({
  label,
  value,
  tone = "slate",
}: {
  label: string
  value: number
  tone?: "slate" | "amber"
}) {
  return (
    <div className={cn(
      "rounded-xl border p-3",
      tone === "amber"
        ? "border-amber-500/30 bg-amber-500/10"
        : "border-slate-800 bg-slate-950/40",
    )}>
      <p className={cn(
        "text-xl font-semibold",
        tone === "amber" ? "text-amber-200" : "text-slate-100",
      )}>
        {value}
      </p>
      <p className={cn(
        "mt-1 text-[11px]",
        tone === "amber" ? "text-amber-100/70" : "text-slate-500",
      )}>
        {label}
      </p>
    </div>
  )
}

function isHighRiskCapability(capability: CapabilityInfo) {
  return capability.risk !== "normal" || capability.level === "sensitive"
}

function SectionButton({
  section,
  current,
  editable,
  onClick,
}: {
  section: SectionInfo
  current: { canView: boolean; canEdit: boolean }
  editable: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!editable || section.locked}
      className={cn(
        "flex min-h-16 items-start justify-between gap-3 rounded-lg border p-3 text-left transition",
        section.locked
          ? "border-slate-800 bg-slate-900/80 opacity-60"
          : current.canEdit
            ? "border-blue-500/40 bg-blue-500/10"
            : current.canView
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-slate-800 bg-slate-900 hover:border-slate-700",
        editable && !section.locked ? "cursor-pointer" : "cursor-default",
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
      <StatusPill locked={section.locked} view={current.canView} edit={current.canEdit} />
    </button>
  )
}

function CapabilityButton({
  capability,
  enabled,
  inherited,
  editable,
  onClick,
}: {
  capability: CapabilityInfo
  enabled: boolean
  inherited: boolean
  editable: boolean
  onClick: () => void
}) {
  const sensitive = capability.risk === "sensitive" || capability.level === "sensitive"
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!editable || capability.locked}
      className={cn(
        "flex min-h-20 items-start justify-between gap-3 rounded-lg border p-3 text-left transition",
        capability.locked
          ? "border-slate-800 bg-slate-900/80 opacity-60"
          : enabled
            ? sensitive
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-blue-500/40 bg-blue-500/10"
            : "border-slate-800 bg-slate-900 hover:border-slate-700",
        editable && !capability.locked ? "cursor-pointer" : "cursor-default",
      )}
    >
      <span>
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-100">
          {capability.label}
          {sensitive && (
            <span className="rounded-full border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
              важно
            </span>
          )}
        </span>
        <span className="mt-1 block text-xs text-slate-500">{capability.description}</span>
        <span className="mt-2 block text-[11px] text-slate-600">
          {capability.locked
            ? `Тариф: ${capability.requiredFeatureLabel ?? capability.requiredFeature}`
            : inherited
              ? "унаследовано от доступа к разделу"
              : "лично настроено для должности"}
        </span>
      </span>
      <span className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold",
        capability.locked
          ? "border-slate-700 text-slate-500"
          : enabled
            ? "border-blue-500/40 text-blue-300"
            : "border-slate-700 text-slate-500",
      )}>
        {capability.locked ? <Lock className="h-3.5 w-3.5" /> : enabled ? <ShieldCheck className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        {capability.locked ? "тариф" : enabled ? "on" : "off"}
      </span>
    </button>
  )
}

function StatusPill({ locked, view, edit }: { locked: boolean; view: boolean; edit: boolean }) {
  return (
    <span className={cn(
      "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold",
      locked
        ? "border-slate-700 text-slate-500"
        : edit
          ? "border-blue-500/40 text-blue-300"
          : view
            ? "border-emerald-500/40 text-emerald-300"
            : "border-slate-700 text-slate-500",
    )}>
      {locked ? <Lock className="h-3.5 w-3.5" /> : edit ? <Edit2 className="h-3.5 w-3.5" /> : view ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      {locked ? "тариф" : edit ? "edit" : view ? "view" : "off"}
    </span>
  )
}
