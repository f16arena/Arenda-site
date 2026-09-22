"use client"
import { askText } from "@/components/ui/dialog-host"

import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react"
import { AlertTriangle, ClipboardCheck, Copy, Edit2, Eye, EyeOff, Lock, Plus, Search, ShieldCheck, Trash2, Users, Zap } from "lucide-react"
import { toast } from "sonner"
import { createRole, deleteRole, setCapability, setPermission, setUserCapabilityOverride } from "@/app/actions/permissions"
import { cn } from "@/lib/utils"
import { capabilityPermissionKey } from "@/lib/capability-keys"
import type { Section } from "@/lib/acl"
import { useT } from "@/lib/i18n/client"

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

type UserInfo = {
  id: string
  name: string
  email: string | null
  role: string
  roleLabel: string
  isActive: boolean
}
type OverrideMode = "ALLOW" | "DENY"
type UserOverrideMap = Record<string, Record<string, OverrideMode>>

type PermMap = Record<string, Record<string, { canView: boolean; canEdit: boolean }>>
type CapabilityFilter = "all" | "enabled" | "highRisk" | "locked" | "explicit"
type RoleReview = {
  role: RoleInfo
  enabled: number
  explicit: number
  highRiskEnabled: number
  examples: CapabilityInfo[]
  score: number
}

// Порядок фильтров фиксирован, подписи и подсказки — из словаря
// (adminSettings.roles.matrix.filters.<dict>Label / <dict>Hint).
const CAPABILITY_FILTERS = [
  { key: "all", dict: "all" },
  { key: "enabled", dict: "enabled" },
  { key: "highRisk", dict: "risk" },
  { key: "locked", dict: "locked" },
  { key: "explicit", dict: "explicit" },
] as const satisfies ReadonlyArray<{ key: CapabilityFilter; dict: string }>

export function PermissionsMatrix({
  roles,
  sections,
  groups,
  capabilities,
  capabilityGroups,
  permissions,
  users,
  userOverrides,
  editable,
}: {
  roles: RoleInfo[]
  sections: SectionInfo[]
  groups: GroupInfo[]
  capabilities: CapabilityInfo[]
  capabilityGroups: CapabilityGroupInfo[]
  permissions: PermMap
  users: UserInfo[]
  userOverrides: UserOverrideMap
  editable: boolean
}) {
  const { t, tp } = useT()
  const [perms, setPerms] = useState(permissions)
  const [tab, setTab] = useState<"roles" | "users">("roles")
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? "")
  const [userOv, setUserOv] = useState(userOverrides)
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

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? null

  // Что даёт РОЛЬ пользователя по этому праву (база, поверх которой идёт override).
  const roleCapabilityEnabled = useCallback((roleKey: string, capability: CapabilityInfo) => {
    if (roleKey === "OWNER") return true
    const permissionKey = capabilityPermissionKey(capability.key)
    const explicit = perms[roleKey]?.[permissionKey]
    if (explicit) return explicit.canView || explicit.canEdit
    const sectionPerm = perms[roleKey]?.[capability.section] ?? { canView: false, canEdit: false }
    return capability.level === "view" ? sectionPerm.canView : sectionPerm.canEdit
  }, [perms])

  const changeUserOverride = (user: UserInfo, capability: CapabilityInfo, mode: "INHERIT" | OverrideMode) => {
    if (!editable) return
    if (capability.locked) {
      toast.info(t("adminSettings.roles.matrix.toast.capLocked", {
        feature: capability.requiredFeatureLabel ?? capability.requiredFeature ?? "",
      }))
      return
    }
    const prev = userOv[user.id]?.[capability.key]
    setUserOv((state) => {
      const nextUser = { ...(state[user.id] ?? {}) }
      if (mode === "INHERIT") delete nextUser[capability.key]
      else nextUser[capability.key] = mode
      return { ...state, [user.id]: nextUser }
    })
    startTransition(async () => {
      try {
        await setUserCapabilityOverride(user.id, capability.key, mode)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("adminSettings.roles.matrix.toast.saveUserError"))
        setUserOv((state) => {
          const nextUser = { ...(state[user.id] ?? {}) }
          if (prev) nextUser[capability.key] = prev
          else delete nextUser[capability.key]
          return { ...state, [user.id]: nextUser }
        })
      }
    })
  }

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

  const roleReviews = useMemo<RoleReview[]>(() => (
    roles
      .filter((role) => role.key !== "OWNER")
      .map((role) => {
        let enabled = 0
        let explicit = 0
        let highRiskEnabled = 0
        const examples: CapabilityInfo[] = []

        for (const capability of capabilities) {
          const state = capabilityState(role, capability)
          if (state.enabled) enabled += 1
          if (!state.inherited) explicit += 1
          if (state.enabled && isHighRiskCapability(capability)) {
            highRiskEnabled += 1
            if (examples.length < 3) examples.push(capability)
          }
        }

        return {
          role,
          enabled,
          explicit,
          highRiskEnabled,
          examples,
          score: highRiskEnabled * 3 + explicit + (role.userCount > 0 ? 2 : 0),
        }
      })
      .filter((review) => review.highRiskEnabled > 0 || review.explicit > 0 || review.role.userCount === 0)
      .sort((a, b) => b.score - a.score)
  ), [capabilities, capabilityState, roles])

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
      toast.info(t("adminSettings.roles.matrix.toast.ownerSections"))
      return
    }
    if (section.locked) {
      toast.info(t("adminSettings.roles.matrix.toast.sectionLocked", {
        feature: section.requiredFeatureLabel ?? section.requiredFeature ?? "",
      }))
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
        toast.error(error instanceof Error ? error.message : t("adminSettings.roles.matrix.toast.saveSectionError"))
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
      toast.info(t("adminSettings.roles.matrix.toast.ownerCaps"))
      return
    }
    if (capability.locked) {
      toast.info(t("adminSettings.roles.matrix.toast.capLocked", {
        feature: capability.requiredFeatureLabel ?? capability.requiredFeature ?? "",
      }))
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
        toast.error(error instanceof Error ? error.message : t("adminSettings.roles.matrix.toast.saveCapError"))
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
        toast.success(t("adminSettings.roles.matrix.toast.roleCreated"))
        setLabel("")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("adminSettings.roles.matrix.toast.roleCreateError"))
      }
    })
  }

  const remove = async (role: RoleInfo) => {
    if (!editable || role.system) return
    // Слово-подтверждение тоже на языке интерфейса: набирают то, что показали.
    const confirmWord = t("adminSettings.roles.matrix.deleteRoleWord")
    const confirmation = await askText({
      title: t("adminSettings.roles.matrix.deleteRoleTitle", { name: role.label }),
      requireText: confirmWord,
      confirmLabel: t("adminSettings.roles.matrix.deleteRoleConfirm"),
    })
    if (confirmation?.trim().toLowerCase() !== confirmWord.toLowerCase()) return
    startTransition(async () => {
      try {
        await deleteRole(role.key)
        toast.success(t("adminSettings.roles.matrix.toast.roleDeleted"))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("adminSettings.roles.matrix.toast.roleDeleteError"))
      }
    })
  }

  if (!selected) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-400">
        {t("adminSettings.roles.matrix.noRoles")}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
        <button
          type="button"
          onClick={() => setTab("roles")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
            tab === "roles" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-900 dark:hover:text-slate-200",
          )}
        >
          <ShieldCheck className="h-4 w-4" />
          {t("adminSettings.roles.matrix.tabRoles")}
        </button>
        <button
          type="button"
          onClick={() => setTab("users")}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
            tab === "users" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-900 dark:hover:text-slate-200",
          )}
        >
          <Users className="h-4 w-4" />
          {t("adminSettings.roles.matrix.tabUsers")}
        </button>
      </div>
      {tab === "users" ? (
        <UsersView
          users={users}
          selectedUserId={selectedUser?.id ?? ""}
          onSelectUser={setSelectedUserId}
          capabilityGroups={capabilityGroups}
          capabilityMap={capabilityMap}
          userOv={userOv}
          roleCapabilityEnabled={roleCapabilityEnabled}
          editable={editable}
          onChange={changeUserOverride}
          query={query}
          setQuery={setQuery}
        />
      ) : (
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminSettings.roles.matrix.rolesTitle")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("adminSettings.roles.matrix.rolesHint")}</p>
            </div>
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs text-slate-400">{roles.length}</span>
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
                    : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 hover:border-slate-700",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", role.color)}>
                    {role.label}
                  </span>
                  <span className="text-xs text-slate-500">{t("adminSettings.roles.matrix.people", { count: role.userCount })}</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {role.system ? t("adminSettings.roles.matrix.systemRole") : t("adminSettings.roles.matrix.customRole")}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminSettings.roles.matrix.createTitle")}</p>
          <p className="mt-1 text-xs text-slate-500">{t("adminSettings.roles.matrix.createHint")}</p>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={!editable || pending}
            placeholder={t("adminSettings.roles.matrix.namePlaceholder")}
            className="mt-3 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <select
            value={sourceRole}
            onChange={(event) => setSourceRole(event.target.value)}
            disabled={!editable || pending}
            className="mt-2 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500 disabled:opacity-50"
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
              {t("adminSettings.roles.matrix.createEmpty")}
            </button>
            <button
              type="button"
              onClick={() => create(true)}
              disabled={!editable || pending || !label.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Copy className="h-4 w-4" />
              {t("adminSettings.roles.matrix.createCopy")}
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <ClipboardCheck className="h-4 w-4 text-blue-700 dark:text-blue-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminSettings.roles.matrix.reviewTitle")}</p>
              <p className="mt-1 text-xs text-slate-500">
                {t("adminSettings.roles.matrix.reviewHint")}
              </p>
            </div>
          </div>

          {roleReviews.length > 0 ? (
            <div className="mt-4 space-y-2">
              {roleReviews.slice(0, 6).map((review) => (
                <button
                  key={review.role.key}
                  type="button"
                  onClick={() => {
                    setSelectedRole(review.role.key)
                    setSourceRole(review.role.key)
                  }}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition",
                    selectedRole === review.role.key
                      ? "border-blue-500/40 bg-blue-500/10"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 hover:border-slate-700",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{review.role.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{tp("adminSettings.roles.matrix.employees", review.role.userCount)}</p>
                    </div>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", review.role.color)}>
                      {review.enabled}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {review.highRiskEnabled > 0 && (
                      <ReviewPill tone="amber">{t("adminSettings.roles.matrix.pillRisk", { count: review.highRiskEnabled })}</ReviewPill>
                    )}
                    {review.explicit > 0 && (
                      <ReviewPill tone="blue">{t("adminSettings.roles.matrix.pillExplicit", { count: review.explicit })}</ReviewPill>
                    )}
                    {review.role.userCount === 0 && (
                      <ReviewPill tone="slate">{t("adminSettings.roles.matrix.pillUnused")}</ReviewPill>
                    )}
                  </div>
                  {review.examples.length > 0 && (
                    <p className="mt-2 line-clamp-2 text-[11px] text-slate-500">
                      {review.examples.map((capability) => capability.label).join(" · ")}
                    </p>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-100">{t("adminSettings.roles.matrix.calmTitle")}</p>
              <p className="mt-1 text-xs text-emerald-200/70">
                {t("adminSettings.roles.matrix.calmHint")}
              </p>
            </div>
          )}
        </div>
      </aside>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-slate-800 p-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", selected.color)}>
                {selected.label}
              </span>
              {selected.key === "OWNER" && (
                <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-xs text-purple-700 dark:text-purple-200">
                  {t("adminSettings.roles.matrix.fullAccess")}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-400">
              {t("adminSettings.roles.matrix.intro")}
            </p>
          </div>
          {!selected.system && (
            <button
              type="button"
              onClick={() => remove(selected)}
              disabled={!editable || pending || selected.userCount > 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-700 dark:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
              title={selected.userCount > 0 ? t("adminSettings.roles.matrix.deleteBlocked") : t("adminSettings.roles.matrix.deleteHint")}
            >
              <Trash2 className="h-4 w-4" />
              {t("adminSettings.roles.matrix.delete")}
            </button>
          )}
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-3 md:grid-cols-6">
            <RoleStat label={t("adminSettings.roles.matrix.statView")} value={selectedStats.view} />
            <RoleStat label={t("adminSettings.roles.matrix.statEdit")} value={selectedStats.edit} />
            <RoleStat label={t("adminSettings.roles.matrix.statEnabled")} value={selectedStats.enabled} />
            <RoleStat label={t("adminSettings.roles.matrix.statExplicit")} value={selectedStats.explicit} />
            <RoleStat label={t("adminSettings.roles.matrix.statLocked")} value={selectedStats.locked} />
            <RoleStat
              label={t("adminSettings.roles.matrix.statRisky")}
              value={selectedStats.highRiskEnabled}
              tone={selectedStats.highRiskEnabled > 0 ? "amber" : "slate"}
            />
          </div>

          {selectedHighRiskCapabilities.length > 0 && selected.key !== "OWNER" && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                <div>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-100">{t("adminSettings.roles.matrix.riskTitle")}</p>
                  <p className="mt-1 text-xs text-amber-100/75">
                    {t("adminSettings.roles.matrix.riskHint")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedHighRiskCapabilities.map((capability) => (
                      <span
                        key={capability.key}
                        className="rounded-full border border-amber-500/30 bg-slate-50 dark:bg-slate-950/40 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-100"
                      >
                        {capability.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminSettings.roles.matrix.sectionsTitle")}</p>
              <p className="mt-1 text-xs text-slate-500">
                {t("adminSettings.roles.matrix.sectionsHint")}
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

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <Zap className="h-4 w-4 text-blue-700 dark:text-blue-300" />
                  {t("adminSettings.roles.matrix.capsTitle")}
                </p>
                <p className="mt-1 max-w-2xl text-xs text-slate-500">
                  {t("adminSettings.roles.matrix.capsHint")}
                </p>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("adminSettings.roles.matrix.search")}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {CAPABILITY_FILTERS.map((filter) => {
                const active = capabilityFilter === filter.key
                const filterLabel = t(`adminSettings.roles.matrix.filters.${filter.dict}Label`)
                const filterHint = t(`adminSettings.roles.matrix.filters.${filter.dict}Hint`)
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setCapabilityFilter(filter.key)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition",
                      active
                        ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-200"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-400 hover:border-slate-700",
                    )}
                    title={filterHint}
                  >
                    <span className="block text-xs font-semibold">{filterLabel}</span>
                    <span className="mt-0.5 block text-[10px] opacity-70">{filterHint}</span>
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
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-center text-sm text-slate-500">
                  {t("adminSettings.roles.matrix.capsNotFound")}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
      )}
    </div>
  )
}

function UsersView({
  users,
  selectedUserId,
  onSelectUser,
  capabilityGroups,
  capabilityMap,
  userOv,
  roleCapabilityEnabled,
  editable,
  onChange,
  query,
  setQuery,
}: {
  users: UserInfo[]
  selectedUserId: string
  onSelectUser: (id: string) => void
  capabilityGroups: CapabilityGroupInfo[]
  capabilityMap: Map<string, CapabilityInfo>
  userOv: UserOverrideMap
  roleCapabilityEnabled: (roleKey: string, capability: CapabilityInfo) => boolean
  editable: boolean
  onChange: (user: UserInfo, capability: CapabilityInfo, mode: "INHERIT" | OverrideMode) => void
  query: string
  setQuery: (value: string) => void
}) {
  const { t } = useT()
  const user = users.find((item) => item.id === selectedUserId) ?? users[0] ?? null

  if (!user) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-400">
        {t("adminSettings.roles.matrix.noUsers")}
      </div>
    )
  }

  const needle = query.trim().toLowerCase()
  const visibleGroups = capabilityGroups
    .map((group) => ({
      ...group,
      capabilities: group.capabilities.filter((key) => {
        const capability = capabilityMap.get(key)
        if (!capability) return false
        if (!needle) return true
        return [capability.key, capability.label, capability.description].join(" ").toLowerCase().includes(needle)
      }),
    }))
    .filter((group) => group.capabilities.length > 0)

  const overrideCount = Object.keys(userOv[user.id] ?? {}).length

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <aside className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminSettings.roles.matrix.usersTitle")}</p>
            <p className="mt-1 text-xs text-slate-500">{t("adminSettings.roles.matrix.usersHint")}</p>
          </div>
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs text-slate-400">{users.length}</span>
        </div>
        <div className="mt-4 space-y-2">
          {users.map((item) => {
            const count = Object.keys(userOv[item.id] ?? {}).length
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectUser(item.id)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left transition",
                  selectedUserId === item.id ? "border-blue-500 bg-blue-500/10" : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 hover:border-slate-700",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.name || item.email || t("adminSettings.roles.matrix.noName")}</span>
                  {count > 0 && <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">{count}</span>}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {item.roleLabel}{!item.isActive ? t("adminSettings.roles.matrix.userDisabled") : ""}
                </p>
              </button>
            )
          })}
        </div>
      </aside>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-slate-800 p-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{user.name || user.email}</p>
            <p className="mt-1 text-sm text-slate-400">
              {t("adminSettings.roles.matrix.userIntroRole")} <span className="text-slate-800 dark:text-slate-200">{user.roleLabel}</span>{" "}
              {t("adminSettings.roles.matrix.userIntroMid")}{" "}
              <span className="text-emerald-700 dark:text-emerald-300">{t("adminSettings.roles.matrix.userIntroGrant")}</span>{" "}
              {t("adminSettings.roles.matrix.userIntroOr")}{" "}
              <span className="text-red-700 dark:text-red-300">{t("adminSettings.roles.matrix.userIntroRevoke")}</span>{" "}
              {t("adminSettings.roles.matrix.userIntroEnd")}
              {overrideCount > 0 && <> {t("adminSettings.roles.matrix.userOverridden")} <span className="text-amber-700 dark:text-amber-300">{overrideCount}</span>.</>}
            </p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("adminSettings.roles.matrix.search")}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="space-y-5 p-5">
          {visibleGroups.map((group) => (
            <div key={group.key}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
              <div className="space-y-2">
                {group.capabilities.map((key) => {
                  const capability = capabilityMap.get(key)
                  if (!capability) return null
                  const inherited = roleCapabilityEnabled(user.role, capability)
                  const override = userOv[user.id]?.[capability.key] ?? null
                  return (
                    <UserCapabilityRow
                      key={capability.key}
                      capability={capability}
                      inherited={inherited}
                      override={override}
                      editable={editable}
                      onChange={(mode) => onChange(user, capability, mode)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
          {visibleGroups.length === 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-center text-sm text-slate-500">
              {t("adminSettings.roles.matrix.actionsNotFound")}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function UserCapabilityRow({
  capability,
  inherited,
  override,
  editable,
  onChange,
}: {
  capability: CapabilityInfo
  inherited: boolean
  override: OverrideMode | null
  editable: boolean
  onChange: (mode: "INHERIT" | OverrideMode) => void
}) {
  const { t } = useT()
  const effective = override === "ALLOW" ? true : override === "DENY" ? false : inherited
  const sensitive = capability.risk === "sensitive" || capability.level === "sensitive"
  const states: Array<{ mode: "INHERIT" | OverrideMode; label: string; active: string }> = [
    {
      mode: "INHERIT",
      label: inherited
        ? t("adminSettings.roles.matrix.modeInheritOn")
        : t("adminSettings.roles.matrix.modeInheritOff"),
      active: "bg-slate-700 text-slate-900 dark:text-slate-100",
    },
    { mode: "ALLOW", label: t("adminSettings.roles.matrix.modeAllow"), active: "bg-emerald-600 text-white" },
    { mode: "DENY", label: t("adminSettings.roles.matrix.modeDeny"), active: "bg-red-600 text-white" },
  ]
  const current: "INHERIT" | OverrideMode = override ?? "INHERIT"

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between",
        capability.locked ? "border-slate-200 dark:border-slate-800 bg-slate-900/80 opacity-60" : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40",
      )}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
          {capability.label}
          {sensitive && (
            <span className="rounded-full border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">{t("adminSettings.roles.matrix.important")}</span>
          )}
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", effective ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-slate-700/50 text-slate-400")}>
            {effective ? t("adminSettings.roles.matrix.available") : t("adminSettings.roles.matrix.hidden")}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-slate-500">{capability.description}</p>
        {capability.locked && (
          <p className="mt-1 text-[11px] text-slate-600">
            {t("adminSettings.roles.matrix.lockedBy", { feature: capability.requiredFeatureLabel ?? capability.requiredFeature ?? "" })}
          </p>
        )}
      </div>
      <div className="inline-flex shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
        {states.map((state) => (
          <button
            key={state.mode}
            type="button"
            disabled={!editable || capability.locked}
            onClick={() => onChange(state.mode)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed",
              current === state.mode ? state.active : "text-slate-400 hover:text-slate-900 dark:hover:text-slate-200",
            )}
          >
            {state.label}
          </button>
        ))}
      </div>
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
        : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40",
    )}>
      <p className={cn(
        "text-xl font-semibold",
        tone === "amber" ? "text-amber-700 dark:text-amber-200" : "text-slate-900 dark:text-slate-100",
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

function ReviewPill({
  tone,
  children,
}: {
  tone: "amber" | "blue" | "slate"
  children: ReactNode
}) {
  const tones = {
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-200",
    slate: "border-slate-200 dark:border-slate-700 bg-slate-800/70 text-slate-400",
  }

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
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
  const { t } = useT()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!editable || section.locked}
      className={cn(
        "flex min-h-16 items-start justify-between gap-3 rounded-lg border p-3 text-left transition",
        section.locked
          ? "border-slate-200 dark:border-slate-800 bg-slate-900/80 opacity-60"
          : current.canEdit
            ? "border-blue-500/40 bg-blue-500/10"
            : current.canView
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-700",
        editable && !section.locked ? "cursor-pointer" : "cursor-default",
      )}
    >
      <span>
        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{section.label}</span>
        <span className="mt-1 block text-xs text-slate-500">
          {section.locked
            ? t("adminSettings.roles.matrix.lockedBy", { feature: section.requiredFeatureLabel ?? section.requiredFeature ?? "" })
            : current.canEdit
              ? t("adminSettings.roles.matrix.sectionEdit")
              : current.canView
                ? t("adminSettings.roles.matrix.sectionView")
                : t("adminSettings.roles.matrix.sectionNone")}
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
  const { t } = useT()
  const sensitive = capability.risk === "sensitive" || capability.level === "sensitive"
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!editable || capability.locked}
      className={cn(
        "flex min-h-20 items-start justify-between gap-3 rounded-lg border p-3 text-left transition",
        capability.locked
          ? "border-slate-200 dark:border-slate-800 bg-slate-900/80 opacity-60"
          : enabled
            ? sensitive
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-blue-500/40 bg-blue-500/10"
            : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-700",
        editable && !capability.locked ? "cursor-pointer" : "cursor-default",
      )}
    >
      <span>
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
          {capability.label}
          {sensitive && (
            <span className="rounded-full border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
              {t("adminSettings.roles.matrix.important")}
            </span>
          )}
        </span>
        <span className="mt-1 block text-xs text-slate-500">{capability.description}</span>
        <span className="mt-2 block text-[11px] text-slate-600">
          {capability.locked
            ? t("adminSettings.roles.matrix.planPrefix", { feature: capability.requiredFeatureLabel ?? capability.requiredFeature ?? "" })
            : inherited
              ? t("adminSettings.roles.matrix.inheritedFromSection")
              : t("adminSettings.roles.matrix.setForRole")}
        </span>
      </span>
      <span className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold",
        capability.locked
          ? "border-slate-200 dark:border-slate-700 text-slate-500"
          : enabled
            ? "border-blue-500/40 text-blue-700 dark:text-blue-300"
            : "border-slate-200 dark:border-slate-700 text-slate-500",
      )}>
        {capability.locked ? <Lock className="h-3.5 w-3.5" /> : enabled ? <ShieldCheck className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        {capability.locked
          ? t("adminSettings.roles.matrix.pillPlan")
          : enabled
            ? t("adminSettings.roles.matrix.pillOn")
            : t("adminSettings.roles.matrix.pillOff")}
      </span>
    </button>
  )
}

function StatusPill({ locked, view, edit }: { locked: boolean; view: boolean; edit: boolean }) {
  const { t } = useT()
  return (
    <span className={cn(
      "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold",
      locked
        ? "border-slate-200 dark:border-slate-700 text-slate-500"
        : edit
          ? "border-blue-500/40 text-blue-700 dark:text-blue-300"
          : view
            ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
            : "border-slate-200 dark:border-slate-700 text-slate-500",
    )}>
      {locked ? <Lock className="h-3.5 w-3.5" /> : edit ? <Edit2 className="h-3.5 w-3.5" /> : view ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      {locked
        ? t("adminSettings.roles.matrix.pillPlan")
        : edit
          ? t("adminSettings.roles.matrix.pillEdit")
          : view
            ? t("adminSettings.roles.matrix.pillView")
            : t("adminSettings.roles.matrix.pillOff")}
    </span>
  )
}
